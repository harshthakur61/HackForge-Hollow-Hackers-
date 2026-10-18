#!/usr/bin/env python3
import psycopg
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from engine.scripts.backtest_forecast import identify_outlier_nights, load_hourly_data
from engine.app.config import DATABASE_URL

df_hourly = load_hourly_data(DATABASE_URL)
outlier_dates = identify_outlier_nights(df_hourly)

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        # 1. Saturday night where policy covers a large drain (max actual_required where break_fee == 0)
        cur.execute("""
            SELECT d.night_date, d.buffer_usd, d.sweep_usd, f.actual_required_usd, d.break_fee, d.net_pnl
            FROM decisions d
            JOIN forecasts f ON d.night_date = f.night_date AND f.model = 'B1' AND f.quantile = 0.98
            WHERE d.strategy = 'S4_policy_zero_overdraft'
              AND EXTRACT(DOW FROM d.night_date) = 6
              AND d.break_fee = 0
            ORDER BY f.actual_required_usd DESC
            LIMIT 5;
        """)
        sat_nights = cur.fetchall()

        # 2. Payday night (1st or 15th)
        cur.execute("""
            SELECT d.night_date, d.buffer_usd, d.sweep_usd, f.actual_required_usd, d.break_fee, d.net_pnl
            FROM decisions d
            JOIN forecasts f ON d.night_date = f.night_date AND f.model = 'B1' AND f.quantile = 0.98
            WHERE d.strategy = 'S4_policy_zero_overdraft'
              AND EXTRACT(DAY FROM d.night_date) IN (1, 15)
            ORDER BY f.actual_required_usd DESC
            LIMIT 5;
        """)
        payday_nights = cur.fetchall()

        # 3. Night with >4-sigma shock hour where repo break occurs
        cur.execute("""
            SELECT d.night_date, d.buffer_usd, d.sweep_usd, f.actual_required_usd, d.break_fee, d.net_pnl
            FROM decisions d
            JOIN forecasts f ON d.night_date = f.night_date AND f.model = 'B1' AND f.quantile = 0.98
            WHERE d.strategy = 'S4_policy_zero_overdraft'
              AND d.break_fee > 0
            ORDER BY d.break_fee DESC;
        """)
        break_nights = cur.fetchall()

print("SATURDAY NIGHTS (COVERED LARGE DRAIN):")
for r in sat_nights:
    print(f"  {r[0]} | Buffer: ${float(r[1]):,.2f} | Actual: ${float(r[3]):,.2f} | BreakFee: ${float(r[4]):,.2f} | NetPnL: ${float(r[5]):,.2f}")

print("\nPAYDAY NIGHTS (1st or 15th):")
for r in payday_nights:
    print(f"  {r[0]} | Buffer: ${float(r[1]):,.2f} | Actual: ${float(r[3]):,.2f} | BreakFee: ${float(r[4]):,.2f} | NetPnL: ${float(r[5]):,.2f}")

print("ALL BREAK NIGHTS FOR S4:")
for r in break_nights:
    d_obj = r[0]
    print(f"  Date: {d_obj} (type {type(d_obj)}) | BreakFee: ${float(r[4]):,.2f} | In outliers: {d_obj in outlier_dates}")

print(f"\nSample outlier dates: {list(outlier_dates)[:5]} (type {type(list(outlier_dates)[0]) if outlier_dates else None})")
