#!/usr/bin/env python3
"""
bootstrap.py: One-command idempotent bootstrap for Reserve Juggler.
1. Waits for PostgreSQL to be ready.
2. Applies all db/init SQL schemas if tables do not exist.
3. Loads and validates the 8,760-row hourly dataset into market_data.
4. Runs Step 3 walk-forward forecast backtest (populates 'forecasts' table).
5. Runs Step 4 strategy backtest (populates 'decisions' table).
6. Prints a concise verification summary with row counts and KPIs.
"""

import os
import sys
import time
from pathlib import Path

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import psycopg
from dotenv import load_dotenv

# Load environment
dotenv_path = REPO_ROOT / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path=dotenv_path)
else:
    load_dotenv()


def get_db_url() -> str:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        user = os.getenv("POSTGRES_USER", "juggler")
        password = os.getenv("POSTGRES_PASSWORD", "juggler")
        db = os.getenv("POSTGRES_DB", "treasury")
        host = os.getenv("POSTGRES_HOST", "localhost")
        port = os.getenv("POSTGRES_PORT", "5432")
        db_url = f"postgresql://{user}:{password}@{host}:{port}/{db}"
    return db_url


def wait_for_postgres(db_url: str, max_retries: int = 30, delay: float = 1.0) -> None:
    print(f"Waiting for PostgreSQL to become ready ({db_url.split('@')[-1]})...")
    for attempt in range(1, max_retries + 1):
        try:
            with psycopg.connect(db_url, connect_timeout=3) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1;")
                    cur.fetchone()
            print("PostgreSQL is ready and accepting connections.")
            return
        except Exception as e:
            if attempt == max_retries:
                print(f"Error connecting to PostgreSQL after {max_retries} attempts: {e}")
                sys.exit(1)
            time.sleep(delay)


def apply_schema_scripts(db_url: str) -> None:
    init_dir = REPO_ROOT / "db" / "init"
    sql_files = sorted(init_dir.glob("*.sql"))
    if not sql_files:
        print("Warning: No .sql files found in db/init/")
        return

    print("Applying database schemas from db/init/...")
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for sql_file in sql_files:
                print(f"  - Executing {sql_file.name}...")
                sql_content = sql_file.read_text(encoding="utf-8")
                cur.execute(sql_content)
        conn.commit()
    print("Database schemas verified.")


def ensure_market_data(db_url: str) -> int:
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM market_data;")
            count = cur.fetchone()[0]

    if count == 8760:
        print(f"market_data table already loaded with {count} rows. Skipping load.")
        return count

    print(f"market_data table has {count} rows (expected 8760). Loading CSV dataset...")
    # Import validation and loader from load_csv.py
    from engine.scripts.load_csv import main as load_csv_main
    load_csv_main()

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM market_data;")
            count = cur.fetchone()[0]
    return count


def ensure_forecasts(db_url: str) -> int:
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM forecasts;")
            count = cur.fetchone()[0]

    if count == 7700:
        print(f"forecasts table already loaded with {count} rows (308 nights x 5 models x 5 quantiles). Skipping.")
        return count

    print(f"forecasts table has {count} rows (expected 7700). Running Step 3 forecast backtest...")
    from engine.scripts.backtest_forecast import main as backtest_forecast_main
    backtest_forecast_main()

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM forecasts;")
            count = cur.fetchone()[0]
    return count


def ensure_decisions(db_url: str) -> int:
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM decisions;")
            count = cur.fetchone()[0]

    if count == 2156:
        print(f"decisions table already loaded with {count} rows (308 nights x 7 strategies). Skipping.")
        return count

    print(f"decisions table has {count} rows (expected 2156). Running Step 4 strategy backtest...")
    from engine.scripts.backtest_strategies import main as backtest_strategies_main
    backtest_strategies_main()

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM decisions;")
            count = cur.fetchone()[0]
    return count


def print_summary(db_url: str) -> None:
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM market_data;")
            market_count = cur.fetchone()[0]

            cur.execute("SELECT count(*), min(night_date), max(night_date) FROM forecasts;")
            f_count, f_min, f_max = cur.fetchone()

            cur.execute("SELECT count(*), min(night_date), max(night_date) FROM decisions;")
            d_count, d_min, d_max = cur.fetchone()

            cur.execute("""
                SELECT strategy, sum(net_pnl), sum(interest), sum(break_fee), sum(overdraft_cost)
                FROM decisions
                WHERE strategy IN ('S4_policy_zero_overdraft', 'S5_policy_cost_optimal')
                GROUP BY strategy
                ORDER BY strategy ASC;
            """)
            kpis = cur.fetchall()

    print("\n" + "=" * 70)
    print("RESERVE JUGGLER BOOTSTRAP SUMMARY")
    print("=" * 70)
    print(f"  market_data rows: {market_count:,} (expected 8,760)")
    print(f"  forecasts rows:   {f_count:,} (expected 7,700, range: {f_min} to {f_max})")
    print(f"  decisions rows:   {d_count:,} (expected 2,156, range: {d_min} to {d_max})")
    print("-" * 70)
    print("  Key Cumulative Backtest KPIs:")
    for strat, net_pnl, interest, break_fee, od_cost in kpis:
        print(f"    {strat}:")
        print(f"      Net P&L:        ${float(net_pnl):,.2f}")
        print(f"      Total Interest: ${float(interest):,.2f}")
        print(f"      Break Fees:     ${float(break_fee):,.2f}")
        print(f"      Overdraft Cost: ${float(od_cost):,.2f}")
    print("=" * 70)
    print("Bootstrap completed successfully. System is fully operational.\n")


def main():
    force = "--force" in sys.argv
    db_url = get_db_url()

    print("=" * 70)
    print("RESERVE JUGGLER: IDEMPOTENT BOOTSTRAP")
    print("=" * 70)

    wait_for_postgres(db_url)
    apply_schema_scripts(db_url)

    if force:
        print("Force flag detected: resetting tables before rebuild...")
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute("TRUNCATE TABLE decisions, forecasts, market_data;")
            conn.commit()

    ensure_market_data(db_url)
    ensure_forecasts(db_url)
    ensure_decisions(db_url)
    print_summary(db_url)


if __name__ == "__main__":
    main()
