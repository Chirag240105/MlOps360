import csv
import hashlib
import io
import math
import random
from datetime import date, timedelta
from typing import Dict, List, Literal, Tuple

ScenarioType = Literal["reference", "corrupted", "drifted"]

STORES: Dict[str, float] = {
    "STORE-01": 1.25,  # High-traffic urban flagship
    "STORE-02": 1.00,  # Suburban standard
    "STORE-03": 0.78,  # Neighborhood express
}

SKUS: List[Dict[str, object]] = [
    {"sku_id": "SKU-101", "category": "Beverages", "base_demand": 42.0, "base_price": 3.50, "elasticity": -1.4},
    {"sku_id": "SKU-102", "category": "Snacks", "base_demand": 35.0, "base_price": 2.80, "elasticity": -1.2},
    {"sku_id": "SKU-103", "category": "Dairy", "base_demand": 50.0, "base_price": 4.20, "elasticity": -0.9},
    {"sku_id": "SKU-104", "category": "Bakery", "base_demand": 22.0, "base_price": 5.00, "elasticity": -1.6},
]

# Deterministic retail holidays (month, day)
HOLIDAY_MONTH_DAYS = {(1, 1), (2, 14), (5, 27), (7, 4), (9, 2), (11, 28), (12, 25)}

CSV_COLUMNS = [
    "date",
    "store_id",
    "sku_id",
    "category",
    "price",
    "discount_pct",
    "is_holiday",
    "units_sold",
]


def generate_retail_records(
    days: int = 120,
    start_date: str = "2026-01-01",
    seed: int = 42,
    scenario: ScenarioType = "reference",
) -> List[Dict[str, object]]:
    """
    Generate deterministic synthetic retail demand records across stores and SKUs.

    Scenarios:
      - reference: Clean historical dataset suitable for training & baseline evaluation.
      - corrupted: Injects negative units, null prices, and duplicate keys to test validation gates.
      - drifted: Shifts pricing, discount frequency, and demand elasticity to simulate production drift.
    """
    rng = random.Random(seed)
    base_dt = date.fromisoformat(start_date)
    records: List[Dict[str, object]] = []

    for day_idx in range(days):
        cur_dt = base_dt + timedelta(days=day_idx)
        dow = cur_dt.weekday()  # 0=Mon .. 6=Sun
        is_weekend = dow in (4, 5, 6)
        is_holiday = 1 if (cur_dt.month, cur_dt.day) in HOLIDAY_MONTH_DAYS else 0
        annual_wave = 1.0 + 0.14 * math.sin(2.0 * math.pi * day_idx / 365.0)
        weekend_mult = 1.24 if is_weekend else 0.94
        holiday_mult = 1.45 if is_holiday else 1.0

        for store_id, store_mult in STORES.items():
            for sku in SKUS:
                base_demand = float(sku["base_demand"])
                base_price = float(sku["base_price"])
                elasticity = float(sku["elasticity"])

                if scenario == "drifted":
                    # Inflation + aggressive promotional regime shift
                    price_factor = rng.uniform(1.18, 1.38)
                    promo_prob = 0.55
                    discount_pct = round(rng.uniform(0.15, 0.40), 2) if rng.random() < promo_prob else 0.0
                    effective_elasticity = elasticity * 1.35
                else:
                    price_factor = rng.uniform(0.95, 1.06)
                    promo_prob = 0.20
                    discount_pct = round(rng.uniform(0.05, 0.25), 2) if rng.random() < promo_prob else 0.0
                    effective_elasticity = elasticity

                effective_price = round(base_price * price_factor, 2)
                net_price_ratio = (effective_price * (1.0 - discount_pct)) / base_price
                price_effect = max(0.35, net_price_ratio ** effective_elasticity)
                promo_lift = 1.0 + (1.35 * discount_pct)

                expected = (
                    base_demand
                    * store_mult
                    * annual_wave
                    * weekend_mult
                    * holiday_mult
                    * price_effect
                    * promo_lift
                )

                noise = rng.gauss(0.0, max(1.5, expected * 0.08))
                # Inject occasional zero-demand stockout/off-days (~2%) to test MAPE safeguards
                if rng.random() < 0.02:
                    units_sold = 0
                else:
                    units_sold = max(0, int(round(expected + noise)))

                records.append(
                    {
                        "date": cur_dt.isoformat(),
                        "store_id": store_id,
                        "sku_id": str(sku["sku_id"]),
                        "category": str(sku["category"]),
                        "price": effective_price,
                        "discount_pct": discount_pct,
                        "is_holiday": is_holiday,
                        "units_sold": units_sold,
                    }
                )

    if scenario == "corrupted" and len(records) >= 12:
        # Inject realistic data engineering failures
        records[1]["units_sold"] = -14
        records[3]["price"] = ""
        records[5]["discount_pct"] = 1.45  # Impossible >100% discount
        records[7]["store_id"] = ""
        # Duplicate primary key (date, store_id, sku_id)
        records.append(dict(records[0]))
        records.append(dict(records[2]))

    return records


def records_to_csv(records: List[Dict[str, object]]) -> str:
    """Serialize retail demand records to canonical CSV string."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for row in records:
        writer.writerow({col: row.get(col, "") for col in CSV_COLUMNS})
    return buf.getvalue()


def compute_sha256(content: str) -> str:
    """Compute immutable SHA-256 checksum for dataset version lineage."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def generate_retail_dataset_csv(
    days: int = 120,
    start_date: str = "2026-01-01",
    seed: int = 42,
    scenario: ScenarioType = "reference",
) -> Tuple[str, str, int]:
    """Return (csv_text, sha256_hash, row_count)."""
    records = generate_retail_records(days=days, start_date=start_date, seed=seed, scenario=scenario)
    csv_text = records_to_csv(records)
    return csv_text, compute_sha256(csv_text), len(records)
