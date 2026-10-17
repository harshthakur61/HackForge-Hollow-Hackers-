#!/usr/bin/env python3
"""
load_csv.py: Validates and bulk-loads treasury dataset into PostgreSQL market_data table.
"""

import os
import sys
from pathlib import Path
import pandas as pd
import psycopg
from dotenv import load_dotenv


def get_db_url() -> str:
    # Look for .env in repo root or current directory
    repo_root = Path(__file__).resolve().parent.parent.parent
    dotenv_path = repo_root / ".env"
    if dotenv_path.exists():
        load_dotenv(dotenv_path=dotenv_path)
    else:
        load_dotenv()

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        user = os.getenv("POSTGRES_USER", "juggler")
        password = os.getenv("POSTGRES_PASSWORD", "juggler")
        db = os.getenv("POSTGRES_DB", "treasury")
        host = os.getenv("POSTGRES_HOST", "localhost")
        port = os.getenv("POSTGRES_PORT", "5432")
        db_url = f"postgresql://{user}:{password}@{host}:{port}/{db}"
    return db_url


def validate_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Validates CSV data according to strict specifications:
    - row count is exactly 8760
    - no null values
    - duplicate or unsorted timestamps
    - no gap other than exactly 1 hour
    - non-negative deposits and withdrawals
    - net_flow_usd differs from (deposits_usd - withdrawals_usd) by <= 0.05
    - repo_sweep_window_open is True only and always at 17:00
    - repo_sweep_mature is True only and always at 08:00
    - parse TRUE/FALSE strings into booleans
    """
    # 1. Row count is exactly 8760
    if len(df) != 8760:
        raise ValueError(
            f"Validation failed: Expected exactly 8760 rows, found {len(df)}"
        )

    # 2. Any nulls
    null_counts = df.isnull().sum()
    if null_counts.any():
        cols_with_nulls = null_counts[null_counts > 0].to_dict()
        raise ValueError(
            f"Validation failed: Dataset contains null values: {cols_with_nulls}"
        )

    expected_cols = [
        "timestamp",
        "deposits_usd",
        "withdrawals_usd",
        "net_flow_usd",
        "repo_sweep_window_open",
        "repo_sweep_mature",
        "tier1_repo_rate_apy",
        "tier2_bond_yield_pct",
        "tier2_bond_price_index",
        "tier2_bond_mod_duration",
        "tier3_stock_index_price",
        "tier3_stock_volatility_pct",
        "tier1_early_redemption_haircut_pct",
        "tier2_bond_liquidation_haircut_pct",
        "tier3_stock_liquidation_haircut_pct",
        "emergency_overdraft_penalty_apr_pct",
    ]
    missing = [c for c in expected_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Validation failed: Missing required columns: {missing}")

    df = df.copy()

    # 9. Parse TRUE/FALSE strings into booleans
    def to_bool(val, col_name: str) -> bool:
        if isinstance(val, (bool, int)):
            return bool(val)
        s = str(val).strip().upper()
        if s in ("TRUE", "1", "T"):
            return True
        elif s in ("FALSE", "0", "F"):
            return False
        raise ValueError(
            f"Validation failed: Cannot parse boolean value '{val}' in column '{col_name}'"
        )

    df["repo_sweep_window_open"] = df["repo_sweep_window_open"].apply(
        lambda v: to_bool(v, "repo_sweep_window_open")
    )
    df["repo_sweep_mature"] = df["repo_sweep_mature"].apply(
        lambda v: to_bool(v, "repo_sweep_mature")
    )

    # Timestamps parsing
    try:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
    except Exception as e:
        raise ValueError(f"Validation failed: Failed to parse timestamps: {e}")

    # 3. Duplicate or unsorted timestamps
    if df["timestamp"].duplicated().any():
        dupes = df[df["timestamp"].duplicated()]["timestamp"].tolist()
        raise ValueError(
            f"Validation failed: Duplicate timestamps found ({len(dupes)} occurrences, e.g. {dupes[:3]})"
        )

    if not df["timestamp"].is_monotonic_increasing:
        raise ValueError(
            "Validation failed: Timestamps are not strictly sorted in chronological order"
        )

    # 4. Any gap other than exactly 1 hour
    time_diffs = df["timestamp"].diff().iloc[1:]
    expected_step = pd.Timedelta(hours=1)
    if not (time_diffs == expected_step).all():
        bad_idx = time_diffs[time_diffs != expected_step].index
        raise ValueError(
            f"Validation failed: Timestamps have gaps other than 1 hour at row indices: {bad_idx.tolist()[:5]}"
        )

    # Ensure numeric columns
    num_cols = [
        "deposits_usd",
        "withdrawals_usd",
        "net_flow_usd",
        "tier1_repo_rate_apy",
        "tier2_bond_yield_pct",
        "tier2_bond_price_index",
        "tier2_bond_mod_duration",
        "tier3_stock_index_price",
        "tier3_stock_volatility_pct",
        "tier1_early_redemption_haircut_pct",
        "tier2_bond_liquidation_haircut_pct",
        "tier3_stock_liquidation_haircut_pct",
        "emergency_overdraft_penalty_apr_pct",
    ]
    for c in num_cols:
        df[c] = pd.to_numeric(df[c], errors="raise")

    # 5. Negative deposits or withdrawals
    if (df["deposits_usd"] < 0).any():
        count_neg = (df["deposits_usd"] < 0).sum()
        raise ValueError(
            f"Validation failed: Found {count_neg} negative deposits_usd entries"
        )
    if (df["withdrawals_usd"] < 0).any():
        count_neg = (df["withdrawals_usd"] < 0).sum()
        raise ValueError(
            f"Validation failed: Found {count_neg} negative withdrawals_usd entries"
        )

    # 6. net_flow_usd differs from deposits_usd minus withdrawals_usd by more than 0.05
    flow_diff = (df["net_flow_usd"] - (df["deposits_usd"] - df["withdrawals_usd"])).abs()
    if (flow_diff > 0.05).any():
        max_diff = flow_diff.max()
        bad_count = (flow_diff > 0.05).sum()
        raise ValueError(
            f"Validation failed: net_flow_usd differs from (deposits_usd - withdrawals_usd) by > 0.05 (max diff: {max_diff:.4f}, {bad_count} rows)"
        )

    # 7. repo_sweep_window_open is True at any hour other than 17 or is not True on every 17:00 row
    hours = df["timestamp"].dt.hour
    bad_window_open = df[(df["repo_sweep_window_open"] == True) & (hours != 17)]
    if not bad_window_open.empty:
        raise ValueError(
            f"Validation failed: repo_sweep_window_open is True at non-17:00 hours ({len(bad_window_open)} rows)"
        )
    missed_window_open = df[(df["repo_sweep_window_open"] != True) & (hours == 17)]
    if not missed_window_open.empty:
        raise ValueError(
            f"Validation failed: repo_sweep_window_open is not True on every 17:00 row ({len(missed_window_open)} rows)"
        )

    # 8. repo_sweep_mature is True at any hour other than 8 or is not True on every 08:00 row
    bad_mature = df[(df["repo_sweep_mature"] == True) & (hours != 8)]
    if not bad_mature.empty:
        raise ValueError(
            f"Validation failed: repo_sweep_mature is True at non-08:00 hours ({len(bad_mature)} rows)"
        )
    missed_mature = df[(df["repo_sweep_mature"] != True) & (hours == 8)]
    if not missed_mature.empty:
        raise ValueError(
            f"Validation failed: repo_sweep_mature is not True on every 08:00 row ({len(missed_mature)} rows)"
        )

    return df


def bulk_load(df: pd.DataFrame, db_url: str):
    columns = [
        "ts",
        "deposits_usd",
        "withdrawals_usd",
        "net_flow_usd",
        "repo_sweep_window_open",
        "repo_sweep_mature",
        "tier1_repo_rate_apy",
        "tier2_bond_yield_pct",
        "tier2_bond_price_index",
        "tier2_bond_mod_duration",
        "tier3_stock_index_price",
        "tier3_stock_volatility_pct",
        "tier1_early_redemption_haircut_pct",
        "tier2_bond_liquidation_haircut_pct",
        "tier3_stock_liquidation_haircut_pct",
        "emergency_overdraft_penalty_apr_pct",
    ]

    load_df = df.rename(columns={"timestamp": "ts"})[columns]

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE market_data;")
            copy_sql = f"COPY market_data ({', '.join(columns)}) FROM STDIN"
            with cur.copy(copy_sql) as copy:
                for row in load_df.itertuples(index=False, name=None):
                    copy.write_row(row)
        conn.commit()


def main():
    repo_root = Path(__file__).resolve().parent.parent.parent
    csv_path = repo_root / "data" / "treasury_4tier_dataset.csv"

    if len(sys.argv) > 1:
        csv_path = Path(sys.argv[1])

    if not csv_path.exists():
        print(f"Error: CSV file not found at {csv_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Reading dataset from {csv_path}...")
    df = pd.read_csv(csv_path)

    print("Validating dataset integrity...")
    validated_df = validate_data(df)
    print("Validation passed successfully.")

    db_url = get_db_url()
    print("Bulk-loading data into PostgreSQL (market_data table)...")
    bulk_load(validated_df, db_url)

    row_count = len(validated_df)
    date_min = validated_df["timestamp"].min()
    date_max = validated_df["timestamp"].max()
    mean_hourly_gross_flow = (
        validated_df["deposits_usd"] + validated_df["withdrawals_usd"]
    ).mean()

    print("\n" + "=" * 60)
    print("Data Layer Load Summary:")
    print(f"  Row Count:              {row_count}")
    print(f"  Date Range:             {date_min} to {date_max}")
    print(f"  Mean Hourly Gross Flow: ${mean_hourly_gross_flow:,.2f}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
