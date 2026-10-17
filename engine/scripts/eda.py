#!/usr/bin/env python3
"""
eda.py: Exploratory Data Analysis for Reserve Juggler.
Reads market_data from PostgreSQL, computes liquidity metrics,
saves charts to docs/eda/, prints numeric tables, and writes docs/eda/findings.md.
"""

import os
import sys
from pathlib import Path
import psycopg
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from dotenv import load_dotenv


def get_db_url() -> str:
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


def fetch_market_data(db_url: str) -> pd.DataFrame:
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM market_data ORDER BY ts ASC;")
            cols = [desc[0] for desc in cur.description]
            records = cur.fetchall()

    df = pd.DataFrame(records, columns=cols)
    for c in df.columns:
        if c != "ts" and c not in ("repo_sweep_window_open", "repo_sweep_mature"):
            df[c] = pd.to_numeric(df[c])

    df["hour"] = df["ts"].dt.hour
    df["dow_num"] = df["ts"].dt.dayofweek  # 0=Monday, 6=Sunday
    df["dow_name"] = df["ts"].dt.day_name()
    df["dom"] = df["ts"].dt.day
    df["month"] = df["ts"].dt.month
    return df


def compute_hour_of_day(df: pd.DataFrame) -> pd.DataFrame:
    res = df.groupby("hour").agg(
        dep_mean=("deposits_usd", "mean"),
        dep_p95=("deposits_usd", lambda x: np.percentile(x, 95)),
        wd_mean=("withdrawals_usd", "mean"),
        wd_p95=("withdrawals_usd", lambda x: np.percentile(x, 95)),
        net_mean=("net_flow_usd", "mean"),
        net_p95=("net_flow_usd", lambda x: np.percentile(x, 95)),
    ).reset_index()
    return res


def compute_day_of_week(df: pd.DataFrame) -> pd.DataFrame:
    dow_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    res = df.groupby(["dow_num", "dow_name"]).agg(
        dep_mean=("deposits_usd", "mean"),
        dep_p95=("deposits_usd", lambda x: np.percentile(x, 95)),
        wd_mean=("withdrawals_usd", "mean"),
        wd_p95=("withdrawals_usd", lambda x: np.percentile(x, 95)),
        net_mean=("net_flow_usd", "mean"),
        net_p95=("net_flow_usd", lambda x: np.percentile(x, 95)),
    ).reset_index().sort_values("dow_num")
    return res


def compute_day_of_month(df: pd.DataFrame) -> pd.DataFrame:
    res = df.groupby("dom").agg(
        net_mean=("net_flow_usd", "mean"),
        wd_mean=("withdrawals_usd", "mean"),
        dep_mean=("deposits_usd", "mean"),
    ).reset_index().sort_values("dom")
    return res


def compute_overnight_troughs(df: pd.DataFrame) -> pd.DataFrame:
    sweep_rows = df[df["repo_sweep_window_open"] == True]
    records = []

    for idx in sweep_rows.index:
        if idx + 15 <= len(df):
            window = df.iloc[idx : idx + 15]
            start_ts = window.iloc[0]["ts"]
            end_ts = window.iloc[-1]["ts"]
            cumsum = window["net_flow_usd"].cumsum()
            min_val = cumsum.min()
            min_rel_idx = cumsum.idxmin() - idx
            trough_ts = window.iloc[min_rel_idx]["ts"]
            trough_hour = trough_ts.hour
            total_net_flow = cumsum.iloc[-1]

            records.append({
                "sweep_date": start_ts.date(),
                "sweep_ts": start_ts,
                "end_ts": end_ts,
                "trough_usd": min_val,
                "trough_hour": trough_hour,
                "trough_ts": trough_ts,
                "total_net_flow_usd": total_net_flow,
            })

    return pd.DataFrame(records)


def compute_outliers(df: pd.DataFrame) -> pd.DataFrame:
    hod_stats = df.groupby("hour").agg(
        dep_mean=("deposits_usd", "mean"),
        dep_std=("deposits_usd", "std"),
        wd_mean=("withdrawals_usd", "mean"),
        wd_std=("withdrawals_usd", "std"),
    )

    outliers = []
    for _, row in df.iterrows():
        h = row["hour"]
        d_mean = hod_stats.loc[h, "dep_mean"]
        d_std = hod_stats.loc[h, "dep_std"]
        w_mean = hod_stats.loc[h, "wd_mean"]
        w_std = hod_stats.loc[h, "wd_std"]

        d_z = (row["deposits_usd"] - d_mean) / d_std
        w_z = (row["withdrawals_usd"] - w_mean) / w_std

        if abs(d_z) > 4:
            outliers.append({
                "ts": row["ts"],
                "hour": h,
                "variable": "deposits_usd",
                "value": row["deposits_usd"],
                "hour_mean": d_mean,
                "hour_std": d_std,
                "z_score": d_z,
            })
        if abs(w_z) > 4:
            outliers.append({
                "ts": row["ts"],
                "hour": h,
                "variable": "withdrawals_usd",
                "value": row["withdrawals_usd"],
                "hour_mean": w_mean,
                "hour_std": w_std,
                "z_score": w_z,
            })

    return pd.DataFrame(outliers).sort_values("ts").reset_index(drop=True)


def compute_market_stats(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    var_cols = [
        "tier1_repo_rate_apy",
        "tier2_bond_yield_pct",
        "tier2_bond_price_index",
        "tier3_stock_index_price",
    ]
    rows = []
    for c in var_cols:
        rows.append({
            "metric": c,
            "mean": df[c].mean(),
            "min": df[c].min(),
            "max": df[c].max(),
            "std": df[c].std(),
        })
    vdf = pd.DataFrame(rows)

    const_cols = [
        "tier2_bond_mod_duration",
        "tier3_stock_volatility_pct",
        "tier1_early_redemption_haircut_pct",
        "tier2_bond_liquidation_haircut_pct",
        "tier3_stock_liquidation_haircut_pct",
        "emergency_overdraft_penalty_apr_pct",
    ]
    constants = {}
    for c in const_cols:
        val = df[c].iloc[0]
        is_const = bool((df[c] == val).all())
        constants[c] = {"value": float(val), "is_constant": is_const}

    return vdf, constants


def compute_autocorrelation(trough_series: pd.Series) -> pd.DataFrame:
    rows = []
    for lag in range(1, 8):
        ac = trough_series.autocorr(lag=lag)
        rows.append({"lag": lag, "autocorrelation": ac})
    return pd.DataFrame(rows)


def compute_cash_vs_repo_earnings(df: pd.DataFrame) -> dict:
    sweep_df = df[df["repo_sweep_window_open"] == True].copy()
    P = 10_000_000.0  # $10M flat sweep
    # CSV floating rate in APY %
    rates = sweep_df["tier1_repo_rate_apy"] / 100.0

    # Overnight interest (1 day):
    # Simple interest (Act/365 convention):
    earn_simple_365 = (P * rates / 365.0).sum()
    # Compound interest:
    earn_comp_365 = (P * ((1.0 + rates) ** (1.0 / 365.0) - 1.0)).sum()
    # Simple interest (Act/360 money market convention):
    earn_simple_360 = (P * rates / 360.0).sum()

    mean_apy = sweep_df["tier1_repo_rate_apy"].mean()

    return {
        "sweep_nights_count": len(sweep_df),
        "flat_principal": P,
        "mean_repo_apy_pct": mean_apy,
        "all_cash_earnings_usd": 0.0,
        "repo_earn_simple_365_usd": earn_simple_365,
        "repo_earn_comp_365_usd": earn_comp_365,
        "repo_earn_simple_360_usd": earn_simple_360,
    }


def generate_charts(
    df: pd.DataFrame,
    hod_df: pd.DataFrame,
    dow_df: pd.DataFrame,
    dom_df: pd.DataFrame,
    tdf: pd.DataFrame,
    outliers_df: pd.DataFrame,
    vdf: pd.DataFrame,
    acf_df: pd.DataFrame,
    out_dir: Path,
):
    out_dir.mkdir(parents=True, exist_ok=True)
    plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")

    # 1. Hour of Day
    fig, ax = plt.subplots(figsize=(10, 5), dpi=300)
    ax.plot(hod_df["hour"], hod_df["dep_mean"] / 1e6, label="Deposits Mean", color="#2563eb", lw=2, marker="o")
    ax.plot(hod_df["hour"], hod_df["dep_p95"] / 1e6, label="Deposits P95", color="#2563eb", lw=1.5, ls="--")
    ax.plot(hod_df["hour"], hod_df["wd_mean"] / 1e6, label="Withdrawals Mean", color="#dc2626", lw=2, marker="s")
    ax.plot(hod_df["hour"], hod_df["wd_p95"] / 1e6, label="Withdrawals P95", color="#dc2626", lw=1.5, ls="--")
    ax.plot(hod_df["hour"], hod_df["net_mean"] / 1e6, label="Net Flow Mean", color="#059669", lw=2, marker="^")
    ax.plot(hod_df["hour"], hod_df["net_p95"] / 1e6, label="Net Flow P95", color="#059669", lw=1.5, ls="--")
    ax.axhline(0, color="#6b7280", lw=1, ls=":")
    ax.set_xticks(range(24))
    ax.set_xlabel("Hour of Day (UTC)")
    ax.set_ylabel("USD (Millions)")
    ax.set_title("Mean and P95 Cash Flows by Hour of Day", fontsize=13, fontweight="bold")
    ax.legend(loc="upper right", frameon=True)
    plt.tight_layout()
    plt.savefig(out_dir / "01_hour_of_day.png")
    plt.close()

    # 2. Day of Week
    fig, ax = plt.subplots(figsize=(10, 5), dpi=300)
    x = np.arange(len(dow_df))
    width = 0.25
    ax.bar(x - width, dow_df["dep_mean"] / 1e6, width, label="Deposits Mean", color="#3b82f6")
    ax.bar(x, dow_df["wd_mean"] / 1e6, width, label="Withdrawals Mean", color="#ef4444")
    ax.bar(x + width, dow_df["net_mean"] / 1e6, width, label="Net Flow Mean", color="#10b981")
    ax.plot(x - width, dow_df["dep_p95"] / 1e6, color="#1e40af", marker="o", ls="", label="Deposits P95")
    ax.plot(x, dow_df["wd_p95"] / 1e6, color="#991b1b", marker="s", ls="", label="Withdrawals P95")
    ax.plot(x + width, dow_df["net_p95"] / 1e6, color="#065f46", marker="^", ls="", label="Net Flow P95")
    ax.set_xticks(x)
    ax.set_xticklabels(dow_df["dow_name"])
    ax.set_ylabel("USD (Millions)")
    ax.set_title("Mean and P95 Cash Flows by Day of Week", fontsize=13, fontweight="bold")
    ax.legend(loc="upper right", frameon=True)
    plt.tight_layout()
    plt.savefig(out_dir / "02_day_of_week.png")
    plt.close()

    # 3. Day of Month
    fig, ax = plt.subplots(figsize=(11, 5), dpi=300)
    ax.plot(dom_df["dom"], dom_df["net_mean"] / 1e6, label="Net Flow Mean", color="#059669", lw=2, marker="o")
    ax.plot(dom_df["dom"], dom_df["wd_mean"] / 1e6, label="Withdrawals Mean", color="#dc2626", lw=2, marker="s")
    ax.axhline(0, color="#6b7280", lw=1, ls=":")
    ax.set_xticks(range(1, 32))
    ax.set_xlabel("Day of Month")
    ax.set_ylabel("USD (Millions)")
    ax.set_title("Mean Net Flow and Withdrawals by Day of Month", fontsize=13, fontweight="bold")
    ax.legend(loc="upper right", frameon=True)
    plt.tight_layout()
    plt.savefig(out_dir / "03_day_of_month.png")
    plt.close()

    # 4. Overnight Trough Annual
    fig, ax = plt.subplots(figsize=(12, 5), dpi=300)
    ax.plot(tdf["sweep_date"], tdf["trough_usd"] / 1e6, color="#6366f1", lw=1.2, label="Nightly Trough (Min Cumsum)")
    ax.plot(tdf["sweep_date"], tdf["total_net_flow_usd"] / 1e6, color="#94a3b8", lw=0.8, ls="--", label="Total 15h Net Flow")
    worst_10 = tdf.sort_values("trough_usd").head(10)
    ax.scatter(worst_10["sweep_date"], worst_10["trough_usd"] / 1e6, color="#dc2626", s=40, zorder=5, label="10 Worst Troughs")
    ax.axhline(0, color="#475569", lw=1, ls=":")
    ax.set_ylabel("USD (Millions)")
    ax.set_xlabel("Sweep Date")
    ax.set_title("Overnight Cumulative Net Flow Trough (17:00 to 07:00) Over the Year", fontsize=13, fontweight="bold")
    ax.legend(loc="lower left", frameon=True)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    plt.tight_layout()
    plt.savefig(out_dir / "04_overnight_trough_annual.png")
    plt.close()

    # 5. Outliers
    fig, ax = plt.subplots(figsize=(12, 5), dpi=300)
    dep_out = outliers_df[outliers_df["variable"] == "deposits_usd"]
    wd_out = outliers_df[outliers_df["variable"] == "withdrawals_usd"]
    ax.scatter(dep_out["ts"], dep_out["value"] / 1e6, color="#2563eb", alpha=0.7, s=35, label=f"Deposits > 4 Std ({len(dep_out)})")
    ax.scatter(wd_out["ts"], wd_out["value"] / 1e6, color="#dc2626", alpha=0.7, s=35, label=f"Withdrawals > 4 Std ({len(wd_out)})")
    # Mark the 10 worst night dates
    for _, w in worst_10.iterrows():
        ax.axvspan(w["sweep_ts"], w["end_ts"], color="#fca5a5", alpha=0.35)
    ax.set_ylabel("USD (Millions)")
    ax.set_xlabel("Timestamp")
    ax.set_title("Hours with Deposits or Withdrawals > 4 Std from Hour-of-Day Mean (Worst 10 Nights Shaded Red)", fontsize=12, fontweight="bold")
    ax.legend(loc="upper right", frameon=True)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    plt.tight_layout()
    plt.savefig(out_dir / "05_outliers.png")
    plt.close()

    # 6. Market Rates and Prices
    fig, axes = plt.subplots(2, 2, figsize=(12, 8), dpi=300)
    axes[0, 0].plot(df["ts"], df["tier1_repo_rate_apy"], color="#2563eb", lw=1)
    axes[0, 0].set_title("Tier 1 Repo Rate (% APY)", fontweight="bold")
    axes[0, 0].set_ylabel("APY %")
    axes[0, 0].xaxis.set_major_formatter(mdates.DateFormatter("%b"))

    axes[0, 1].plot(df["ts"], df["tier2_bond_yield_pct"], color="#059669", lw=1)
    axes[0, 1].set_title("Tier 2 Bond Yield (%)", fontweight="bold")
    axes[0, 1].set_ylabel("Yield %")
    axes[0, 1].xaxis.set_major_formatter(mdates.DateFormatter("%b"))

    axes[1, 0].plot(df["ts"], df["tier2_bond_price_index"], color="#d97706", lw=1)
    axes[1, 0].set_title("Tier 2 Bond Price Index", fontweight="bold")
    axes[1, 0].set_ylabel("Index")
    axes[1, 0].xaxis.set_major_formatter(mdates.DateFormatter("%b"))

    axes[1, 1].plot(df["ts"], df["tier3_stock_index_price"], color="#7c3aed", lw=1)
    axes[1, 1].set_title("Tier 3 Stock Index Price", fontweight="bold")
    axes[1, 1].set_ylabel("Price USD")
    axes[1, 1].xaxis.set_major_formatter(mdates.DateFormatter("%b"))

    plt.suptitle("Floating Market Rates and Asset Prices Over Time", fontsize=14, fontweight="bold")
    plt.tight_layout()
    plt.savefig(out_dir / "06_market_rates_and_prices.png")
    plt.close()

    # 7. Autocorrelation
    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=300)
    colors = ["#2563eb" if v >= 0 else "#dc2626" for v in acf_df["autocorrelation"]]
    bars = ax.bar(acf_df["lag"], acf_df["autocorrelation"], color=colors, width=0.5)
    ax.axhline(0, color="#6b7280", lw=1)
    ax.set_xticks(range(1, 8))
    ax.set_xlabel("Lag (Days / Nights)")
    ax.set_ylabel("Autocorrelation")
    ax.set_ylim(-0.5, 1.0)
    ax.set_title("Autocorrelation of Nightly Trough (Lags 1 to 7)", fontsize=13, fontweight="bold")
    for bar in bars:
        h = bar.get_height()
        va = "bottom" if h >= 0 else "top"
        ax.annotate(f"{h:.4f}", xy=(bar.get_x() + bar.get_width() / 2, h),
                    xytext=(0, 3 if h >= 0 else -10), textcoords="offset points",
                    ha="center", va=va, fontsize=9, fontweight="bold")
    plt.tight_layout()
    plt.savefig(out_dir / "07_trough_autocorrelation.png")
    plt.close()


def print_tables_and_generate_findings(
    hod_df: pd.DataFrame,
    dow_df: pd.DataFrame,
    dom_df: pd.DataFrame,
    tdf: pd.DataFrame,
    outliers_df: pd.DataFrame,
    vdf: pd.DataFrame,
    constants: dict,
    acf_df: pd.DataFrame,
    cash_repo_res: dict,
    docs_dir: Path,
):
    # Calculations for Trough stats:
    p50 = np.percentile(tdf["trough_usd"], 50)
    p90 = np.percentile(tdf["trough_usd"], 90)
    p95 = np.percentile(tdf["trough_usd"], 95)
    p99 = np.percentile(tdf["trough_usd"], 99)
    max_trough = tdf["trough_usd"].max()
    min_trough = tdf["trough_usd"].min()
    std_trough = tdf["trough_usd"].std()
    worst_10 = tdf.sort_values("trough_usd").head(10).reset_index(drop=True)

    # Check alignment of 10 worst nights with 4-std outliers:
    alignments = []
    for _, w in worst_10.iterrows():
        w_start = w["sweep_ts"]
        w_end = w["end_ts"]
        matches = outliers_df[(outliers_df["ts"] >= w_start) & (outliers_df["ts"] <= w_end)]
        alignments.append({
            "sweep_date": w["sweep_date"],
            "trough_usd": w["trough_usd"],
            "trough_hour": w["trough_hour"],
            "trough_ts": w["trough_ts"],
            "total_net_flow_usd": w["total_net_flow_usd"],
            "outlier_count": len(matches),
            "outliers": matches.to_dict(orient="records"),
        })

    # Terminal Outputs
    print("\n" + "=" * 90)
    print("STEP 2: EXPLORATORY DATA ANALYSIS (EDA) REPORT")
    print("=" * 90)

    print("\n[1] MEAN AND P95 BY HOUR OF DAY (0-23):")
    print(f"{'Hour':>4} | {'Dep Mean':>14} | {'Dep P95':>14} | {'WD Mean':>14} | {'WD P95':>14} | {'Net Mean':>14} | {'Net P95':>14}")
    print("-" * 105)
    for _, r in hod_df.iterrows():
        print(f"{int(r['hour']):4d} | {r['dep_mean']:14,.2f} | {r['dep_p95']:14,.2f} | {r['wd_mean']:14,.2f} | {r['wd_p95']:14,.2f} | {r['net_mean']:14,.2f} | {r['net_p95']:14,.2f}")

    print("\n[2] MEAN AND P95 BY DAY OF WEEK:")
    print(f"{'Day':>9} | {'Dep Mean':>14} | {'Dep P95':>14} | {'WD Mean':>14} | {'WD P95':>14} | {'Net Mean':>14} | {'Net P95':>14}")
    print("-" * 110)
    for _, r in dow_df.iterrows():
        print(f"{r['dow_name']:>9} | {r['dep_mean']:14,.2f} | {r['dep_p95']:14,.2f} | {r['wd_mean']:14,.2f} | {r['wd_p95']:14,.2f} | {r['net_mean']:14,.2f} | {r['net_p95']:14,.2f}")

    print("\n[3] MEAN NET FLOW AND WITHDRAWALS BY DAY OF MONTH:")
    print(f"{'DOM':>4} | {'Withdrawals Mean':>18} | {'Net Flow Mean':>18} | {'Deposits Mean':>18}")
    print("-" * 65)
    for _, r in dom_df.iterrows():
        print(f"{int(r['dom']):4d} | {r['wd_mean']:18,.2f} | {r['net_mean']:18,.2f} | {r['dep_mean']:18,.2f}")

    print("\n[4] OVERNIGHT TROUGH PER NIGHT (17:00 D to 07:00 D+1, 15 Hours, 364 Windows):")
    print(f"  Min (Worst Trough):   ${min_trough:16,.2f}")
    print(f"  P50 (Median Trough):  ${p50:16,.2f}")
    print(f"  P90:                  ${p90:16,.2f}")
    print(f"  P95:                  ${p95:16,.2f}")
    print(f"  P99:                  ${p99:16,.2f}")
    print(f"  Max:                  ${max_trough:16,.2f}")
    print(f"  Std:                  ${std_trough:16,.2f}")

    print("\n  10 WORST NIGHTS (LARGEST OVERNIGHT NET OUTFLOW TROUGHS):")
    print(f"  {'Rank':>4} | {'Date':>10} | {'Trough (Min Cumsum)':>22} | {'Trough Hour':>11} | {'Total Window Net Flow':>23}")
    print("  " + "-" * 82)
    for i, r in enumerate(worst_10.itertuples(), start=1):
        print(f"  {i:4d} | {str(r.sweep_date):>10} | {r.trough_usd:22,.2f} | {r.trough_hour:11d} | {r.total_net_flow_usd:23,.2f}")

    print(f"\n[5] OUTLIERS (>4 STD FROM MEAN FOR HOUR-OF-DAY): Total = {len(outliers_df)} hours")
    print(f"  {'Timestamp':>19} | {'Variable':>15} | {'Value':>14} | {'Hour Mean':>14} | {'Z-Score':>8}")
    print("  " + "-" * 80)
    for r in outliers_df.head(15).itertuples():
        print(f"  {str(r.ts):>19} | {r.variable:>15} | {r.value:14,.2f} | {r.hour_mean:14,.2f} | {r.z_score:8.2f}")
    if len(outliers_df) > 15:
        print(f"  ... and {len(outliers_df) - 15} more outliers (documented in docs/eda/findings.md)")

    print("\n  CHECK: DO THE 10 WORST NIGHTS LINE UP WITH 4-STD OUTLIERS?")
    for a in alignments:
        print(f"  Night {a['sweep_date']} (Trough: ${a['trough_usd']:,.2f} at {a['trough_hour']}:00):")
        if a["outlier_count"] == 0:
            print("    -> No >4-std outlier hours in this 15h window.")
        else:
            for o in a["outliers"]:
                print(f"    -> Outlier at {o['ts']}: {o['variable']} = ${o['value']:,.2f} (z = {o['z_score']:+.2f})")

    print("\n[6] MARKET RATES, ASSET PRICES, AND CONSTANTS:")
    print("  Varying Columns:")
    print(f"  {'Metric':>25} | {'Mean':>12} | {'Min':>12} | {'Max':>12} | {'Std':>12}")
    print("  " + "-" * 75)
    for r in vdf.itertuples():
        print(f"  {r.metric:>25} | {r.mean:12.4f} | {r.min:12.4f} | {r.max:12.4f} | {r.std:12.4f}")

    print("\n  Constant Columns:")
    for col, data in constants.items():
        print(f"  {col:>36}: value = {data['value']:.4f} (constant: {data['is_constant']})")

    print("\n[7] AUTOCORRELATION OF NIGHTLY TROUGH (LAGS 1 TO 7):")
    print(f"  {'Lag':>4} | {'Autocorrelation':>15}")
    print("  " + "-" * 23)
    for r in acf_df.itertuples():
        print(f"  {r.lag:4d} | {r.autocorrelation:15.4f}")

    print("\n[8] ANNUAL STRATEGY COMPARISON: ALL-CASH VS FLAT $10M REPO SWEEP:")
    print(f"  Sweep Nights Evaluated:          {cash_repo_res['sweep_nights_count']}")
    print(f"  Flat Principal Swept:            ${cash_repo_res['flat_principal']:,.2f}")
    print(f"  Mean Floating Repo APY:          {cash_repo_res['mean_repo_apy_pct']:.4f}%")
    print(f"  All-Cash Strategy Earnings:      ${cash_repo_res['all_cash_earnings_usd']:,.2f} (leaves entire cash balance idle at 0% APY)")
    print(f"  Repo Sweep Earned (Act/365):     ${cash_repo_res['repo_earn_simple_365_usd']:,.2f}")
    print(f"  Repo Sweep Earned (Compound):    ${cash_repo_res['repo_earn_comp_365_usd']:,.2f}")
    print(f"  Repo Sweep Earned (Act/360):     ${cash_repo_res['repo_earn_simple_360_usd']:,.2f}")
    print("=" * 90 + "\n")

    # Generate docs/eda/findings.md
    findings_file = docs_dir / "findings.md"
    with open(findings_file, "w") as f:
        f.write("# Exploratory Data Analysis (EDA) Findings\n\n")
        f.write("All figures and tables in this document were computed directly from `market_data` in PostgreSQL (8,760 hourly rows from 2026-01-01 00:00:00 to 2026-12-31 23:00:00).\n\n")
        f.write("> **Assumption**: Cash flows in the 17:00 row occur *after* the overnight sweep decision is executed at 17:00.\n\n")
        f.write("---\n\n")

        # 1. Hour of Day
        f.write("## 1. Cash Flows by Hour of Day (0-23)\n\n")
        f.write("![Hour of Day Flows](01_hour_of_day.png)\n\n")
        f.write("| Hour | Deposits Mean ($) | Deposits P95 ($) | Withdrawals Mean ($) | Withdrawals P95 ($) | Net Flow Mean ($) | Net Flow P95 ($) |\n")
        f.write("|---|---:|---:|---:|---:|---:|---:|\n")
        for _, r in hod_df.iterrows():
            f.write(f"| {int(r['hour']):02d} | {r['dep_mean']:,.2f} | {r['dep_p95']:,.2f} | {r['wd_mean']:,.2f} | {r['wd_p95']:,.2f} | {r['net_mean']:,.2f} | {r['net_p95']:,.2f} |\n")
        f.write("\n---\n\n")

        # 2. Day of Week
        f.write("## 2. Cash Flows by Day of Week\n\n")
        f.write("![Day of Week Flows](02_day_of_week.png)\n\n")
        f.write("| Day | Deposits Mean ($) | Deposits P95 ($) | Withdrawals Mean ($) | Withdrawals P95 ($) | Net Flow Mean ($) | Net Flow P95 ($) |\n")
        f.write("|---|---:|---:|---:|---:|---:|---:|\n")
        for _, r in dow_df.iterrows():
            f.write(f"| {r['dow_name']} | {r['dep_mean']:,.2f} | {r['dep_p95']:,.2f} | {r['wd_mean']:,.2f} | {r['wd_p95']:,.2f} | {r['net_mean']:,.2f} | {r['net_p95']:,.2f} |\n")
        f.write("\n---\n\n")

        # 3. Day of Month
        f.write("## 3. Mean Net Flow and Withdrawals by Day of Month\n\n")
        f.write("![Day of Month Flows](03_day_of_month.png)\n\n")
        f.write("| Day of Month | Withdrawals Mean ($) | Net Flow Mean ($) | Deposits Mean ($) |\n")
        f.write("|---|---:|---:|---:|\n")
        for _, r in dom_df.iterrows():
            f.write(f"| {int(r['dom']):02d} | {r['wd_mean']:,.2f} | {r['net_mean']:,.2f} | {r['dep_mean']:,.2f} |\n")
        f.write("\n---\n\n")

        # 4. Overnight Trough
        f.write("## 4. Overnight Cumulative Outflow Trough (17:00 to 07:00)\n\n")
        f.write("For each date D with an open sweep window (17:00), the 15-hour window spanning 17:00 on D through 07:00 on D+1 was evaluated (total 364 complete windows across the year). The trough is defined as the minimum cumulative net flow over this window.\n\n")
        f.write("![Overnight Troughs Annual](04_overnight_trough_annual.png)\n\n")
        f.write("### Trough Distribution Metrics\n")
        f.write(f"- **Minimum (Worst Trough)**: `${min_trough:,.2f}`\n")
        f.write(f"- **P50 (Median)**: `${p50:,.2f}`\n")
        f.write(f"- **P90**: `${p90:,.2f}`\n")
        f.write(f"- **P95**: `${p95:,.2f}`\n")
        f.write(f"- **P99**: `${p99:,.2f}`\n")
        f.write(f"- **Maximum**: `${max_trough:,.2f}`\n")
        f.write(f"- **Standard Deviation**: `${std_trough:,.2f}`\n\n")

        f.write("### 10 Worst Nights of the Year\n\n")
        f.write("| Rank | Sweep Date | Trough (Min Cumsum $) | Hour of Trough | Total Net Flow over 15h ($) |\n")
        f.write("|---:|:---:|---:|:---:|---:|\n")
        for i, r in enumerate(worst_10.itertuples(), start=1):
            f.write(f"| {i} | {r.sweep_date} | {r.trough_usd:,.2f} | {r.trough_hour:02d}:00 | {r.total_net_flow_usd:,.2f} |\n")
        f.write("\n---\n\n")

        # 5. Outliers
        f.write("## 5. Outlier Detection (> 4 Standard Deviations from Hour-of-Day Mean)\n\n")
        f.write(f"Across all 8,760 hours, exactly **{len(outliers_df)} hours** exceeded 4 standard deviations from their specific hour-of-day mean ({len(outliers_df[outliers_df['variable'] == 'deposits_usd'])} deposit spikes and {len(outliers_df[outliers_df['variable'] == 'withdrawals_usd'])} withdrawal spikes).\n\n")
        f.write("![Outliers](05_outliers.png)\n\n")
        f.write("### Alignment with the 10 Worst Nights\n\n")
        for a in alignments:
            f.write(f"- **Night of {a['sweep_date']}** (Trough: `${a['trough_usd']:,.2f}` at `{a['trough_hour']:02d}:00`):\n")
            if a["outlier_count"] == 0:
                f.write("  - *No individual >4-std outlier hour occurred within this 15-hour window. The trough resulted from sustained continuous net outflows rather than a single hourly outlier.*\n")
            else:
                for o in a["outliers"]:
                    f.write(f"  - **Outlier at {o['ts']}**: `{o['variable']}` = `${o['value']:,.2f}` (hour mean = `${o['hour_mean']:,.2f}`, z-score = `{o['z_score']:+.2f}`)\n")
        f.write("\n### Complete Outlier Listings (>4 Std)\n\n")
        f.write("| Timestamp | Variable | Observed Value ($) | Hour-of-Day Mean ($) | Std ($) | Z-Score |\n")
        f.write("|:---:|:---:|---:|---:|---:|---:|\n")
        for r in outliers_df.itertuples():
            f.write(f"| {r.ts} | {r.variable} | {r.value:,.2f} | {r.hour_mean:,.2f} | {r.hour_std:,.2f} | {r.z_score:+.2f} |\n")
        f.write("\n---\n\n")

        # 6. Rates, Prices and Constants
        f.write("## 6. Market Rates, Asset Prices, and Constant Parameters\n\n")
        f.write("![Market Rates and Prices](06_market_rates_and_prices.png)\n\n")
        f.write("### Floating Variables\n\n")
        f.write("| Column Name | Mean | Minimum | Maximum | Std |\n")
        f.write("|---|---:|---:|---:|---:|\n")
        for r in vdf.itertuples():
            f.write(f"| `{r.metric}` | {r.mean:.4f} | {r.min:.4f} | {r.max:.4f} | {r.std:.4f} |\n")
        f.write("\n### Constant Columns\n\n")
        f.write("| Column Name | Constant Value | Verified Invariant across all 8,760 rows |\n")
        f.write("|---|---:|:---:|\n")
        for col, data in constants.items():
            f.write(f"| `{col}` | {data['value']:.4f} | {data['is_constant']} |\n")
        f.write("\n---\n\n")

        # 7. Autocorrelation
        f.write("## 7. Autocorrelation of Nightly Troughs (Lags 1 to 7)\n\n")
        f.write("![Autocorrelation](07_trough_autocorrelation.png)\n\n")
        f.write("| Lag (Days) | Autocorrelation |\n")
        f.write("|---:|---:|\n")
        for r in acf_df.itertuples():
            f.write(f"| {r.lag} | {r.autocorrelation:.4f} |\n")
        f.write("\n---\n\n")

        # 8. All-Cash vs Flat $10M Sweep
        f.write("## 8. Annual Strategy Comparison: All-Cash vs Flat $10M Overnight Sweep\n\n")
        f.write("- **Sweep Nights Evaluated**: 365 sweep windows\n")
        f.write("- **Flat Principal Swept**: $10,000,000.00\n")
        f.write(f"- **Mean Floating Repo APY**: {cash_repo_res['mean_repo_apy_pct']:.4f}%\n\n")
        f.write("### Returns\n")
        f.write("- **All-Cash Strategy (Tier 0)**: Leaves all funds idle earning **$0.00** (0% APY).\n")
        f.write(f"- **Overnight Repo Sweep ($10M Flat, Act/365 simple interest)**: Earns **${cash_repo_res['repo_earn_simple_365_usd']:,.2f}**\n")
        f.write(f"- **Overnight Repo Sweep ($10M Flat, Compound daily rate)**: Earns **${cash_repo_res['repo_earn_comp_365_usd']:,.2f}**\n")
        f.write(f"- **Overnight Repo Sweep ($10M Flat, Act/360 money market)**: Earns **${cash_repo_res['repo_earn_simple_360_usd']:,.2f}**\n")


def main():
    repo_root = Path(__file__).resolve().parent.parent.parent
    docs_dir = repo_root / "docs" / "eda"
    db_url = get_db_url()

    print(f"Connecting to PostgreSQL database at {db_url}...")
    df = fetch_market_data(db_url)
    print(f"Successfully loaded {len(df)} records from market_data.")

    # 1. Hour of Day
    hod_df = compute_hour_of_day(df)

    # 2. Day of Week
    dow_df = compute_day_of_week(df)

    # 3. Day of Month
    dom_df = compute_day_of_month(df)

    # 4. Overnight Trough
    tdf = compute_overnight_troughs(df)

    # 5. Outliers
    outliers_df = compute_outliers(df)

    # 6. Rates, Prices and Constants
    vdf, constants = compute_market_stats(df)

    # 7. Autocorrelation
    acf_df = compute_autocorrelation(tdf["trough_usd"])

    # 8. All-Cash vs Sweep $10M
    cash_repo_res = compute_cash_vs_repo_earnings(df)

    # Generate charts
    print(f"Generating charts in {docs_dir}...")
    generate_charts(
        df, hod_df, dow_df, dom_df, tdf, outliers_df, vdf, acf_df, docs_dir
    )
    print("Charts generated successfully.")

    # Print tables and write findings.md
    print_tables_and_generate_findings(
        hod_df, dow_df, dom_df, tdf, outliers_df, vdf, constants, acf_df, cash_repo_res, docs_dir
    )
    print(f"Summary written to {docs_dir / 'findings.md'}")


if __name__ == "__main__":
    main()
