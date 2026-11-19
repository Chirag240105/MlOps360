import csv
import io
import math
import statistics
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

REQUIRED_COLUMNS = [
    "date",
    "store_id",
    "sku_id",
    "category",
    "price",
    "discount_pct",
    "is_holiday",
    "units_sold",
]


@dataclass
class ValidationCheck:
    rule: str
    passed: bool
    severity: str  # "error" | "warning"
    message: str
    details: Dict[str, Any]


def _is_missing(val: Optional[str]) -> bool:
    return val is None or str(val).strip() == ""


def _try_float(val: str) -> Optional[float]:
    try:
        num = float(val)
        return num if math.isfinite(num) else None
    except (ValueError, TypeError):
        return None


def _try_int(val: str) -> Optional[int]:
    try:
        f = float(val)
        if not math.isfinite(f) or not f.is_integer():
            return None
        return int(f)
    except (ValueError, TypeError):
        return None


def _percentile(sorted_vals: List[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = q * (len(sorted_vals) - 1)
    lo = math.floor(idx)
    hi = math.ceil(idx)
    if lo == hi:
        return sorted_vals[lo]
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (idx - lo)


def validate_and_profile_csv(
    csv_text: str,
    max_missing_ratio: float = 0.05,
    min_rows: int = 30,
) -> Dict[str, Any]:
    """
    Execute strict pre-training data quality gates and produce an EDA summary.
    Blocks training if any rule with severity == 'error' fails.
    """
    reader = csv.DictReader(io.StringIO(csv_text))
    fieldnames = reader.fieldnames or []
    rows = list(reader)
    row_count = len(rows)

    checks: List[ValidationCheck] = []

    # 1. Schema presence check
    missing_cols = [c for c in REQUIRED_COLUMNS if c not in fieldnames]
    checks.append(
        ValidationCheck(
            rule="schema_required_columns",
            passed=len(missing_cols) == 0,
            severity="error",
            message=(
                "All required columns are present"
                if not missing_cols
                else f"Missing required columns: {', '.join(missing_cols)}"
            ),
            details={"missingColumns": missing_cols, "foundColumns": fieldnames},
        )
    )

    # 2. Minimum sample size check
    checks.append(
        ValidationCheck(
            rule="minimum_row_count",
            passed=row_count >= min_rows,
            severity="error",
            message=(
                f"Dataset has {row_count} rows (minimum {min_rows})"
                if row_count >= min_rows
                else f"Dataset has only {row_count} rows; at least {min_rows} required"
            ),
            details={"rowCount": row_count, "minRows": min_rows},
        )
    )

    if missing_cols or row_count == 0:
        return {
            "passed": False,
            "rowCount": row_count,
            "checks": [asdict(c) for c in checks],
            "eda": None,
        }

    # Row-level inspection
    missing_counts: Dict[str, int] = {c: 0 for c in REQUIRED_COLUMNS}
    seen_keys: set[Tuple[str, str, str]] = set()
    duplicate_keys = 0
    invalid_dates = 0
    negative_units = 0
    non_positive_prices = 0
    invalid_discounts = 0
    invalid_holidays = 0

    parsed_dates: List[date] = []
    prices: List[float] = []
    discounts: List[float] = []
    units: List[float] = []
    stores: set[str] = set()
    skus: set[str] = set()
    categories: set[str] = set()
    zero_demand_count = 0

    for row in rows:
        for col in REQUIRED_COLUMNS:
            if _is_missing(row.get(col)):
                missing_counts[col] += 1

        d_raw = (row.get("date") or "").strip()
        s_raw = (row.get("store_id") or "").strip()
        k_raw = (row.get("sku_id") or "").strip()
        cat_raw = (row.get("category") or "").strip()

        if s_raw:
            stores.add(s_raw)
        if k_raw:
            skus.add(k_raw)
        if cat_raw:
            categories.add(cat_raw)

        if d_raw and s_raw and k_raw:
            pk = (d_raw, s_raw, k_raw)
            if pk in seen_keys:
                duplicate_keys += 1
            else:
                seen_keys.add(pk)

        if d_raw:
            try:
                parsed_dates.append(date.fromisoformat(d_raw))
            except ValueError:
                invalid_dates += 1

        p_raw = (row.get("price") or "").strip()
        if p_raw:
            p_val = _try_float(p_raw)
            if p_val is None or p_val <= 0:
                non_positive_prices += 1
            else:
                prices.append(p_val)

        disc_raw = (row.get("discount_pct") or "").strip()
        if disc_raw:
            disc_val = _try_float(disc_raw)
            if disc_val is None or disc_val < 0 or disc_val > 0.95:
                invalid_discounts += 1
            else:
                discounts.append(disc_val)

        hol_raw = (row.get("is_holiday") or "").strip()
        if hol_raw:
            hol_val = _try_int(hol_raw)
            if hol_val not in (0, 1):
                invalid_holidays += 1

        u_raw = (row.get("units_sold") or "").strip()
        if u_raw:
            u_val = _try_float(u_raw)
            if u_val is None or u_val < 0:
                negative_units += 1
            else:
                units.append(u_val)
                if u_val == 0:
                    zero_demand_count += 1

    # 3. Missing-value ratio gate
    failing_missing = {
        col: round(cnt / row_count, 4)
        for col, cnt in missing_counts.items()
        if (cnt / row_count) > max_missing_ratio or (col in ("date", "store_id", "sku_id", "units_sold") and cnt > 0)
    }
    checks.append(
        ValidationCheck(
            rule="missing_values_within_threshold",
            passed=len(failing_missing) == 0,
            severity="error",
            message=(
                "Missing values within acceptable bounds"
                if not failing_missing
                else f"Columns violated missingness bounds: {list(failing_missing.keys())}"
            ),
            details={"missingCounts": missing_counts, "violations": failing_missing, "maxMissingRatio": max_missing_ratio},
        )
    )

    # 4. Duplicate primary-key check
    checks.append(
        ValidationCheck(
            rule="unique_date_store_sku_keys",
            passed=duplicate_keys == 0,
            severity="error",
            message=(
                "No duplicate (date, store_id, sku_id) rows detected"
                if duplicate_keys == 0
                else f"Detected {duplicate_keys} duplicate (date, store_id, sku_id) records"
            ),
            details={"duplicateKeys": duplicate_keys},
        )
    )

    # 5. Domain bounds check
    domain_errors = invalid_dates + negative_units + non_positive_prices + invalid_discounts + invalid_holidays
    checks.append(
        ValidationCheck(
            rule="domain_value_constraints",
            passed=domain_errors == 0,
            severity="error",
            message=(
                "All dates, prices, discounts, holiday flags, and units_sold satisfy domain constraints"
                if domain_errors == 0
                else "Domain constraint violations detected"
            ),
            details={
                "invalidDates": invalid_dates,
                "negativeUnitsSold": negative_units,
                "nonPositivePrices": non_positive_prices,
                "invalidDiscounts": invalid_discounts,
                "invalidHolidays": invalid_holidays,
            },
        )
    )

    # 6. IQR Outlier analysis (warning-level diagnostic, does not hard-block valid spikes)
    sorted_units = sorted(units)
    outlier_count = 0
    upper_fence = 0.0
    if len(sorted_units) >= 4:
        q1 = _percentile(sorted_units, 0.25)
        q3 = _percentile(sorted_units, 0.75)
        iqr = q3 - q1
        upper_fence = q3 + 1.5 * iqr
        outlier_count = sum(1 for u in sorted_units if u > upper_fence)

    outlier_ratio = round(outlier_count / max(1, len(sorted_units)), 4)
    checks.append(
        ValidationCheck(
            rule="target_outlier_analysis",
            passed=outlier_ratio <= 0.10,
            severity="warning",
            message=f"IQR upper fence={upper_fence:.2f}; {outlier_count} high-demand spike rows ({outlier_ratio:.2%})",
            details={"upperFence": round(upper_fence, 2), "outlierCount": outlier_count, "outlierRatio": outlier_ratio},
        )
    )

    def summarize(vals: List[float]) -> Dict[str, Any]:
        if not vals:
            return {"count": 0}
        s = sorted(vals)
        return {
            "count": len(vals),
            "min": round(s[0], 3),
            "p25": round(_percentile(s, 0.25), 3),
            "median": round(_percentile(s, 0.50), 3),
            "p75": round(_percentile(s, 0.75), 3),
            "max": round(s[-1], 3),
            "mean": round(statistics.fmean(vals), 3),
            "std": round(statistics.pstdev(vals), 3) if len(vals) > 1 else 0.0,
        }

    min_date = min(parsed_dates).isoformat() if parsed_dates else None
    max_date = max(parsed_dates).isoformat() if parsed_dates else None
    passed = all(c.passed for c in checks if c.severity == "error")

    return {
        "passed": passed,
        "rowCount": row_count,
        "checks": [asdict(c) for c in checks],
        "eda": {
            "dateRange": {"start": min_date, "end": max_date, "distinctDays": len(set(parsed_dates))},
            "cardinality": {
                "stores": sorted(stores),
                "skus": sorted(skus),
                "categories": sorted(categories),
            },
            "zeroDemandRows": zero_demand_count,
            "missingCounts": missing_counts,
            "numericSummary": {
                "units_sold": summarize(units),
                "price": summarize(prices),
                "discount_pct": summarize(discounts),
            },
        },
    }
