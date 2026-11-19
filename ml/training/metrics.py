import math
from typing import Dict, List


def compute_regression_metrics(
    y_true: List[float],
    y_pred: List[float],
    mape_min_actual: float = 1.0,
) -> Dict[str, object]:
    """
    Compute MAE, RMSE, safeguarded MAPE, sMAPE, and R^2.

    Safeguard: Days with zero (or near-zero < mape_min_actual) demand cause standard
    MAPE = |y - y_hat| / |y| to explode to infinity. We exclude those from MAPE
    while reporting `zeroActualCount` and also computing symmetric MAPE (sMAPE).
    """
    if len(y_true) != len(y_pred) or len(y_true) == 0:
        raise ValueError("y_true and y_pred must have equal non-zero length")

    n = len(y_true)
    abs_errors: List[float] = []
    sq_errors: List[float] = []
    ape_terms: List[float] = []
    smape_terms: List[float] = []
    zero_actual_count = 0

    for actual, pred in zip(y_true, y_pred):
        err = actual - pred
        abs_err = abs(err)
        abs_errors.append(abs_err)
        sq_errors.append(err * err)

        if abs(actual) >= mape_min_actual:
            ape_terms.append(abs_err / abs(actual))
        else:
            zero_actual_count += 1

        denom = abs(actual) + abs(pred)
        if denom > 0:
            smape_terms.append((2.0 * abs_err) / denom)
        else:
            smape_terms.append(0.0)

    mae = sum(abs_errors) / n
    rmse = math.sqrt(sum(sq_errors) / n)
    mape = (sum(ape_terms) / len(ape_terms) * 100.0) if ape_terms else None
    smape = (sum(smape_terms) / n) * 100.0

    mean_y = sum(y_true) / n
    ss_tot = sum((y - mean_y) ** 2 for y in y_true)
    ss_res = sum(sq_errors)
    r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

    return {
        "samples": n,
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mapePct": round(mape, 2) if mape is not None else None,
        "smapePct": round(smape, 2),
        "r2": round(r2, 4),
        "zeroActualCount": zero_actual_count,
    }
