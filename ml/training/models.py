import math
import random
from typing import Any, Dict, List, Optional, Tuple


def _solve_linear_system(a: List[List[float]], b: List[float]) -> List[float]:
    n = len(b)
    mat = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot_row = max(range(col, n), key=lambda r: abs(mat[r][col]))
        mat[col], mat[pivot_row] = mat[pivot_row], mat[col]
        pivot = mat[col][col]
        if abs(pivot) < 1e-12:
            continue
        for j in range(col, n + 1):
            mat[col][j] /= pivot
        for r in range(n):
            if r != col and mat[r][col] != 0.0:
                factor = mat[r][col]
                for j in range(col, n + 1):
                    mat[r][j] -= factor * mat[col][j]
    return [mat[i][n] for i in range(n)]


def fit_ridge_model(x: List[List[float]], y: List[float], l2_alpha: float = 1.0) -> Dict[str, Any]:
    """Fit Ridge Regression with bias term; serialize weights as JSON-safe dict."""
    x_aug = [[1.0] + row for row in x]
    nf = len(x_aug[0])
    xtx = [[0.0] * nf for _ in range(nf)]
    xty = [0.0] * nf
    for row, target in zip(x_aug, y):
        for i in range(nf):
            xty[i] += row[i] * target
            ri = row[i]
            for j in range(nf):
                xtx[i][j] += ri * row[j]
    for i in range(1, nf):
        xtx[i][i] += l2_alpha
    weights = _solve_linear_system(xtx, xty)
    return {"type": "ridge", "l2_alpha": l2_alpha, "weights": [round(w, 6) for w in weights]}


def predict_ridge_model(artifact_model: Dict[str, Any], x: List[List[float]]) -> List[float]:
    weights: List[float] = artifact_model["weights"]
    preds: List[float] = []
    for row in x:
        val = weights[0] + sum(w * xi for w, xi in zip(weights[1:], row))
        preds.append(max(0.0, val))
    return preds


def _fit_cart_tree(
    x: List[List[float]],
    y: List[float],
    indices: List[int],
    max_depth: int,
    min_samples_leaf: int,
    feature_subsample: Optional[int],
    rng: random.Random,
    depth: int = 0,
    max_thresholds: int = 16,
) -> Dict[str, Any]:
    """Fit a fast quantile-candidate CART regression tree serialized directly as JSON dict."""
    n = len(indices)
    mean_val = sum(y[i] for i in indices) / n

    if depth >= max_depth or n < 2 * min_samples_leaf:
        return {"leaf": round(mean_val, 5)}

    y_vals = [y[i] for i in indices]
    if max(y_vals) - min(y_vals) < 1e-8:
        return {"leaf": round(mean_val, 5)}

    total_sum = sum(y_vals)
    total_sq = sum(v * v for v in y_vals)
    best_sse = total_sq - (total_sum * total_sum) / n
    best_split: Optional[Tuple[int, float, List[int], List[int]]] = None

    n_features = len(x[0])
    candidate_features = list(range(n_features))
    if feature_subsample is not None and feature_subsample < n_features:
        candidate_features = rng.sample(candidate_features, feature_subsample)

    for f_idx in candidate_features:
        pairs = sorted((x[i][f_idx], i) for i in indices)
        unique_vals: List[float] = []
        last_v: Optional[float] = None
        for v, _ in pairs:
            if last_v is None or abs(v - last_v) > 1e-9:
                unique_vals.append(v)
                last_v = v

        if len(unique_vals) <= 1:
            continue

        # Sample candidate midpoints for fast O(n log n + thresholds * n) splitting
        if len(unique_vals) - 1 <= max_thresholds:
            thresholds = [(unique_vals[k] + unique_vals[k + 1]) * 0.5 for k in range(len(unique_vals) - 1)]
        else:
            step = (len(unique_vals) - 1) / max_thresholds
            thresholds = []
            for m in range(max_thresholds):
                idx = min(len(unique_vals) - 2, int(m * step))
                thresholds.append((unique_vals[idx] + unique_vals[idx + 1]) * 0.5)

        for thresh in thresholds:
            left_idx: List[int] = []
            right_idx: List[int] = []
            left_sum = 0.0
            left_sq = 0.0
            for v, row_i in pairs:
                yv = y[row_i]
                if v <= thresh:
                    left_idx.append(row_i)
                    left_sum += yv
                    left_sq += yv * yv
                else:
                    right_idx.append(row_i)

            nl = len(left_idx)
            nr = n - nl
            if nl < min_samples_leaf or nr < min_samples_leaf:
                continue

            right_sum = total_sum - left_sum
            right_sq = total_sq - left_sq
            sse = (left_sq - (left_sum * left_sum) / nl) + (right_sq - (right_sum * right_sum) / nr)
            if sse < best_sse - 1e-7:
                best_sse = sse
                best_split = (f_idx, thresh, left_idx, right_idx)

    if best_split is None:
        return {"leaf": round(mean_val, 5)}

    f_idx, thresh, left_idx, right_idx = best_split
    return {
        "feature": f_idx,
        "threshold": round(thresh, 5),
        "left": _fit_cart_tree(
            x, y, left_idx, max_depth, min_samples_leaf, feature_subsample, rng, depth + 1, max_thresholds
        ),
        "right": _fit_cart_tree(
            x, y, right_idx, max_depth, min_samples_leaf, feature_subsample, rng, depth + 1, max_thresholds
        ),
    }


def _predict_tree_row(node: Dict[str, Any], row: List[float]) -> float:
    while "leaf" not in node:
        if row[node["feature"]] <= node["threshold"]:
            node = node["left"]
        else:
            node = node["right"]
    return float(node["leaf"])


def fit_random_forest_model(
    x: List[List[float]],
    y: List[float],
    n_estimators: int = 16,
    max_depth: int = 6,
    min_samples_leaf: int = 4,
    seed: int = 42,
) -> Dict[str, Any]:
    rng = random.Random(seed)
    n = len(x)
    n_features = len(x[0])
    feature_subsample = max(3, int(math.sqrt(n_features)) + 2)
    trees: List[Dict[str, Any]] = []

    for _ in range(n_estimators):
        bootstrap_idx = [rng.randrange(n) for _ in range(n)]
        trees.append(
            _fit_cart_tree(
                x=x,
                y=y,
                indices=bootstrap_idx,
                max_depth=max_depth,
                min_samples_leaf=min_samples_leaf,
                feature_subsample=feature_subsample,
                rng=rng,
            )
        )

    return {
        "type": "random_forest",
        "n_estimators": n_estimators,
        "max_depth": max_depth,
        "min_samples_leaf": min_samples_leaf,
        "trees": trees,
    }


def predict_random_forest_model(artifact_model: Dict[str, Any], x: List[List[float]]) -> List[float]:
    trees: List[Dict[str, Any]] = artifact_model["trees"]
    k = len(trees)
    return [max(0.0, sum(_predict_tree_row(t, row) for t in trees) / k) for row in x]


def fit_gradient_boosting_model(
    x: List[List[float]],
    y: List[float],
    n_estimators: int = 24,
    learning_rate: float = 0.12,
    max_depth: int = 4,
    min_samples_leaf: int = 5,
    seed: int = 42,
) -> Dict[str, Any]:
    rng = random.Random(seed)
    n = len(x)
    base_pred = sum(y) / n
    current_preds = [base_pred] * n
    all_indices = list(range(n))
    trees: List[Dict[str, Any]] = []

    for _ in range(n_estimators):
        residuals = [yi - pi for yi, pi in zip(y, current_preds)]
        tree = _fit_cart_tree(
            x=x,
            y=residuals,
            indices=all_indices,
            max_depth=max_depth,
            min_samples_leaf=min_samples_leaf,
            feature_subsample=None,
            rng=rng,
        )
        trees.append(tree)
        for i in range(n):
            current_preds[i] += learning_rate * _predict_tree_row(tree, x[i])

    return {
        "type": "gradient_boosting",
        "base_prediction": round(base_pred, 5),
        "learning_rate": learning_rate,
        "n_estimators": n_estimators,
        "max_depth": max_depth,
        "trees": trees,
    }


def predict_gradient_boosting_model(artifact_model: Dict[str, Any], x: List[List[float]]) -> List[float]:
    base_pred = float(artifact_model["base_prediction"])
    lr = float(artifact_model["learning_rate"])
    trees: List[Dict[str, Any]] = artifact_model["trees"]
    preds: List[float] = []
    for row in x:
        val = base_pred + lr * sum(_predict_tree_row(t, row) for t in trees)
        preds.append(max(0.0, val))
    return preds


def predict_from_model_dict(artifact_model: Dict[str, Any], x: List[List[float]]) -> List[float]:
    m_type = artifact_model.get("type")
    if m_type == "ridge":
        return predict_ridge_model(artifact_model, x)
    if m_type == "random_forest":
        return predict_random_forest_model(artifact_model, x)
    if m_type == "gradient_boosting":
        return predict_gradient_boosting_model(artifact_model, x)
    raise ValueError(f"Unsupported serialized model type: {m_type}")
