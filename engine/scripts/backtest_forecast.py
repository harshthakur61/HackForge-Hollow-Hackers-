#!/usr/bin/env python3
"""
backtest_forecast.py: Walk-forward expanding window backtest for nightly buffer forecasting.
Evaluates B0, B1, B2, M1, and M2 across quantiles [0.5, 0.9, 0.95, 0.98, 0.99].
Persists forecasts to PostgreSQL, saves fitted final model to engine/models/,
and outputs results to docs/forecast/.
"""

import os
import sys
from pathlib import Path

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import psycopg
import pandas as pd
import numpy as np
import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from dotenv import load_dotenv

from engine.app.config import DATABASE_URL, DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT, EVALUATION_QUANTILES
from engine.app.features import build_feature_dataset
from engine.app.models import (
    predict_b0_static,
    predict_b1_same_weekday,
    predict_b2_max_last4_same_dow,
    M1QuantileModel,
    ConformalShiftTracker,
)


def load_hourly_data(db_url: str) -> pd.DataFrame:
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM market_data ORDER BY ts ASC;")
            cols = [desc[0] for desc in cur.description]
            records = cur.fetchall()

    df = pd.DataFrame(records, columns=cols)
    for c in df.columns:
        if c != "ts" and c not in ("repo_sweep_window_open", "repo_sweep_mature"):
            df[c] = pd.to_numeric(df[c])
    return df


def identify_outlier_nights(df_hourly: pd.DataFrame) -> set:
    """
    Finds dates D whose 15h overnight window (17:00 D to 07:00 D+1)
    contains an hour where deposits or withdrawals exceed 4 std from hour-of-day mean.
    """
    df = df_hourly.copy()
    df["hour"] = df["ts"].dt.hour
    stats = df.groupby("hour").agg({
        "deposits_usd": ["mean", "std"],
        "withdrawals_usd": ["mean", "std"],
    })

    outlier_timestamps = set()
    for _, r in df.iterrows():
        h = r["hour"]
        dm, ds = stats.loc[h, ("deposits_usd", "mean")], stats.loc[h, ("deposits_usd", "std")]
        wm, ws = stats.loc[h, ("withdrawals_usd", "mean")], stats.loc[h, ("withdrawals_usd", "std")]
        if abs(r["deposits_usd"] - dm) / ds > 4.0 or abs(r["withdrawals_usd"] - wm) / ws > 4.0:
            outlier_timestamps.add(r["ts"])

    sweep_indices = df[df["repo_sweep_window_open"] == True].index
    outlier_sweep_dates = set()
    for idx in sweep_indices:
        if idx + 15 <= len(df):
            window = df.iloc[idx : idx + 15]
            sweep_date = window.iloc[0]["ts"].date()
            if any(ts in outlier_timestamps for ts in window["ts"]):
                outlier_sweep_dates.add(sweep_date)

    return outlier_sweep_dates


def run_walk_forward_backtest(
    dataset: pd.DataFrame,
    quantiles: list[float] = EVALUATION_QUANTILES,
    start_idx: int = 56,
    retrain_interval: int = 7,
) -> tuple[pd.DataFrame, M1QuantileModel]:
    """
    Runs walk-forward backtest starting at night index 56.
    Retrains M1 every 7 nights using only prior nights.
    """
    records = []
    conformal_tracker = ConformalShiftTracker(window_size=60, min_history=30)
    current_m1: M1QuantileModel = None

    total_nights = len(dataset)
    for i in range(start_idx, total_nights):
        # Retrain every 7 nights using only prior nights
        if (i - start_idx) % retrain_interval == 0:
            train_df = dataset.iloc[:i]
            current_m1 = M1QuantileModel(quantiles=quantiles)
            current_m1.fit(train_df, train_df["required_buffer_usd"])

        row = dataset.iloc[i]
        d = row["sweep_date"]
        actual = float(row["required_buffer_usd"])
        repo_rate = float(row["repo_rate_17"])
        dow = int(row["day_of_week"])
        prior_df = dataset.iloc[:i]

        m1_preds = current_m1.predict_single(row)

        for q in quantiles:
            b0_val = predict_b0_static(prior_df["required_buffer_usd"], q)
            b1_val = predict_b1_same_weekday(prior_df, dow, q)
            b2_val = predict_b2_max_last4_same_dow(prior_df, dow)
            m1_val = m1_preds[q]
            m2_val = conformal_tracker.apply_shift(q, m1_val)

            # Record predictions
            models_preds = [
                ("B0", b0_val),
                ("B1", b1_val),
                ("B2", b2_val),
                ("M1", m1_val),
                ("M2", m2_val),
            ]
            for m_name, b_val in models_preds:
                records.append({
                    "night_idx": i,
                    "night_date": d,
                    "model": m_name,
                    "quantile": q,
                    "buffer_usd": b_val,
                    "actual_required_usd": actual,
                    "repo_rate_apy": repo_rate,
                    "day_of_week": dow,
                    "is_fri_sat": dow in (4, 5),
                })

            # Update conformal shift tracker with out-of-sample M1 residual
            conformal_tracker.update(q, actual, m1_val)

    # Train final model on all data
    final_m1 = M1QuantileModel(quantiles=quantiles)
    final_m1.fit(dataset, dataset["required_buffer_usd"])

    results_df = pd.DataFrame(records)
    return results_df, final_m1


def compute_performance_metrics(
    sub_df: pd.DataFrame,
    quantiles: list[float] = EVALUATION_QUANTILES,
    cu: float = DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT / 100.0,
) -> pd.DataFrame:
    """
    Computes performance table for each model and quantile:
    - coverage: share of nights actual <= buffer
    - pinball_loss: pinball loss
    - mean_buffer: mean buffer in $
    - shortfall_nights: count of shortfall nights
    - total_shortfall: sum of shortfall in $
    - total_cost: shortfall * Cu + sum(buffer * repo_rate / 365)
    """
    rows = []
    models_order = ["B0", "B1", "B2", "M1", "M2"]

    for m in models_order:
        for q in quantiles:
            m_df = sub_df[(sub_df["model"] == m) & (np.isclose(sub_df["quantile"], q))].copy()
            if m_df.empty:
                continue

            n_nights = len(m_df)
            actual = m_df["actual_required_usd"].values
            buffer = m_df["buffer_usd"].values
            repo_rates = m_df["repo_rate_apy"].values

            # Coverage
            coverage = float(np.mean(actual <= buffer))

            # Pinball loss
            diff = actual - buffer
            pinball = float(np.mean(np.maximum(q * diff, (q - 1.0) * diff)))

            # Mean buffer
            mean_buf = float(np.mean(buffer))

            # Shortfall nights and total shortfall
            shortfalls = np.maximum(0.0, diff)
            shortfall_nights = int(np.sum(diff > 0.0))
            total_shortfall = float(np.sum(shortfalls))

            # Total cost = shortfall * Cu + sum(buffer * repo_rate / 365)
            opportunity_cost = float(np.sum(buffer * (repo_rates / 100.0 / 365.0)))
            penalty_cost = total_shortfall * cu
            total_cost = penalty_cost + opportunity_cost

            rows.append({
                "model": m,
                "quantile": q,
                "nights_count": n_nights,
                "coverage": coverage,
                "pinball_loss": pinball,
                "mean_buffer_usd": mean_buf,
                "shortfall_nights": shortfall_nights,
                "total_shortfall_usd": total_shortfall,
                "total_cost_usd": total_cost,
            })

    return pd.DataFrame(rows)


def persist_forecasts_to_db(results_df: pd.DataFrame, db_url: str):
    """
    Persists evaluation forecasts into PostgreSQL forecasts table.
    """
    cols = ["night_date", "model", "quantile", "buffer_usd", "actual_required_usd"]
    insert_records = []
    for _, r in results_df.iterrows():
        insert_records.append((
            r["night_date"],
            r["model"],
            float(r["quantile"]),
            float(r["buffer_usd"]),
            float(r["actual_required_usd"]),
        ))

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE forecasts;")
            with cur.copy("COPY forecasts (night_date, model, quantile, buffer_usd, actual_required_usd) FROM STDIN") as copy:
                for row in insert_records:
                    copy.write_row(row)
        conn.commit()


def generate_charts(
    dataset: pd.DataFrame,
    results_df: pd.DataFrame,
    out_dir: Path,
):
    out_dir.mkdir(parents=True, exist_ok=True)
    plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")

    # 1. Forecast vs Actual for 8 weeks (last 56 nights of evaluation)
    eval_dates = sorted(results_df["night_date"].unique())
    last_8_weeks_dates = eval_dates[-56:]
    sub = results_df[
        (results_df["night_date"].isin(last_8_weeks_dates))
        & (np.isclose(results_df["quantile"], 0.98))
    ]

    dates = last_8_weeks_dates
    actual_series = [
        sub[(sub["night_date"] == d) & (sub["model"] == "M1")]["actual_required_usd"].iloc[0] / 1e6
        for d in dates
    ]
    m1_series = [
        sub[(sub["night_date"] == d) & (sub["model"] == "M1")]["buffer_usd"].iloc[0] / 1e6
        for d in dates
    ]
    m2_series = [
        sub[(sub["night_date"] == d) & (sub["model"] == "M2")]["buffer_usd"].iloc[0] / 1e6
        for d in dates
    ]
    b1_series = [
        sub[(sub["night_date"] == d) & (sub["model"] == "B1")]["buffer_usd"].iloc[0] / 1e6
        for d in dates
    ]
    b0_series = [
        sub[(sub["night_date"] == d) & (sub["model"] == "B0")]["buffer_usd"].iloc[0] / 1e6
        for d in dates
    ]

    fig, ax = plt.subplots(figsize=(13, 6), dpi=300)
    ax.plot(dates, actual_series, label="Actual Required Buffer", color="#0f172a", lw=2.2, marker="o", markersize=4)
    ax.plot(dates, m2_series, label="M2 (Conformal Shift q=0.98)", color="#2563eb", lw=2, ls="-")
    ax.plot(dates, m1_series, label="M1 (XGBoost q=0.98)", color="#059669", lw=1.8, ls="--")
    ax.plot(dates, b1_series, label="B1 (Weekday Quantile q=0.98)", color="#d97706", lw=1.5, ls=":")
    ax.plot(dates, b0_series, label="B0 (Static Quantile q=0.98)", color="#94a3b8", lw=1.2, ls="-.")
    ax.set_ylabel("Buffer Required (USD Millions)")
    ax.set_xlabel("Night Date")
    ax.set_title("8-Week Forecast Comparison vs Actual (q=0.98)", fontsize=13, fontweight="bold")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.legend(loc="upper right", frameon=True)
    plt.tight_layout()
    plt.savefig(out_dir / "forecast_vs_actual_8weeks.png")
    plt.close()

    # 2. Coverage by Model (Realized vs Target Quantile)
    fig, ax = plt.subplots(figsize=(8, 6), dpi=300)
    quantiles = EVALUATION_QUANTILES
    ax.plot(quantiles, quantiles, color="#64748b", ls="--", lw=1.5, label="Ideal Calibration (1:1)")

    models = ["M2", "M1", "B1", "B0"]
    colors = {"M2": "#2563eb", "M1": "#059669", "B1": "#d97706", "B0": "#94a3b8"}
    markers = {"M2": "o", "M1": "s", "B1": "^", "B0": "v"}

    for m in models:
        m_covs = []
        for q in quantiles:
            cov = (
                results_df[(results_df["model"] == m) & (np.isclose(results_df["quantile"], q))]
                .apply(lambda r: r["actual_required_usd"] <= r["buffer_usd"], axis=1)
                .mean()
            )
            m_covs.append(cov)
        ax.plot(quantiles, m_covs, label=f"{m} Realized", color=colors[m], marker=markers[m], lw=2)

    ax.set_xlabel("Target Quantile (q)")
    ax.set_ylabel("Realized Out-of-Sample Coverage")
    ax.set_title("Calibration Curve: Realized Coverage by Model", fontsize=13, fontweight="bold")
    ax.set_xticks(quantiles)
    ax.set_yticks(np.arange(0.5, 1.05, 0.05))
    ax.legend(loc="lower right", frameon=True)
    plt.tight_layout()
    plt.savefig(out_dir / "coverage_by_model.png")
    plt.close()


def print_and_write_results(
    t1_all: pd.DataFrame,
    t2_frisat: pd.DataFrame,
    t3_outliers: pd.DataFrame,
    docs_dir: Path,
):
    def format_perf_table(df: pd.DataFrame, title: str) -> str:
        lines = [
            f"### {title}",
            "",
            "| Model | Quantile | Coverage | Pinball Loss ($) | Mean Buffer ($) | Shortfalls | Shortfall ($) | Total Cost ($) |",
            "|:---|---:|---:|---:|---:|---:|---:|---:|",
        ]
        for _, r in df.iterrows():
            lines.append(
                f"| {r['model']:4s} | {r['quantile']:.2f} | {r['coverage']:8.4f} | "
                f"{r['pinball_loss']:16,.2f} | {r['mean_buffer_usd']:15,.2f} | "
                f"{int(r['shortfall_nights']):10d} | {r['total_shortfall_usd']:15,.2f} | "
                f"{r['total_cost_usd']:14,.2f} |"
            )
        lines.append("")
        return "\n".join(lines)

    def print_terminal_table(df: pd.DataFrame, title: str):
        print("\n" + "=" * 115)
        print(title)
        print("=" * 115)
        print(f"{'Model':>5} | {'Quantile':>8} | {'Coverage':>8} | {'Pinball Loss':>16} | {'Mean Buffer ($)':>16} | {'Shortfalls':>10} | {'Shortfall ($)':>16} | {'Total Cost ($)':>16}")
        print("-" * 115)
        for _, r in df.iterrows():
            print(
                f"{r['model']:>5} | {r['quantile']:8.2f} | {r['coverage']:8.4f} | "
                f"{r['pinball_loss']:16,.2f} | {r['mean_buffer_usd']:16,.2f} | "
                f"{int(r['shortfall_nights']):10d} | {r['total_shortfall_usd']:16,.2f} | "
                f"{r['total_cost_usd']:16,.2f}"
            )

    print_terminal_table(t1_all, "TABLE 1: ALL EVALUATION NIGHTS (308 NIGHTS, INDEX 56 TO 363)")
    print_terminal_table(t2_frisat, "TABLE 2: FRIDAY & SATURDAY NIGHTS ONLY (88 NIGHTS)")
    print_terminal_table(t3_outliers, "TABLE 3: NIGHTS CONTAINING A >4-SIGMA HOUR (24 NIGHTS)")

    results_md = docs_dir / "results.md"
    with open(results_md, "w") as f:
        f.write("# Nightly Buffer Forecast Engine: Backtest Results\n\n")
        f.write("Evaluation framework: Walk-forward expanding window starting at night index 56 through 363 (308 out-of-sample nights). Models retrained every 7 nights using strictly prior history.\n\n")
        f.write("Cost parameters:\n")
        f.write(f"- $C_u$ (under-buffering early redemption penalty): {DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT}%\n")
        f.write("- $C_o$ (over-buffering opportunity cost): overnight repo yield per dollar ($rate / 100 / 365$)\n")
        f.write("- Total Cost = Total Shortfall $\\times C_u + \\sum (\\text{Buffer} \\times \\text{Repo Rate} / 365)$\n\n")
        f.write("---\n\n")

        f.write("## 1. Visualizations\n\n")
        f.write("![Forecast vs Actual 8 Weeks](forecast_vs_actual_8weeks.png)\n\n")
        f.write("![Coverage Calibration by Model](coverage_by_model.png)\n\n")
        f.write("---\n\n")

        f.write("## 2. Performance Tables\n\n")
        f.write(format_perf_table(t1_all, "Table 1: All Evaluation Nights (308 Nights)"))
        f.write(format_perf_table(t2_frisat, "Table 2: Friday & Saturday Nights Only (88 Nights)"))
        f.write(format_perf_table(t3_outliers, "Table 3: Nights Containing a >4-Sigma Outlier Hour (24 Nights)"))

    print(f"\nReport written to {results_md}")


def main():
    repo_root = Path(__file__).resolve().parent.parent.parent
    docs_dir = repo_root / "docs" / "forecast"
    models_dir = repo_root / "engine" / "models"
    docs_dir.mkdir(parents=True, exist_ok=True)
    models_dir.mkdir(parents=True, exist_ok=True)

    print(f"Connecting to database at {DATABASE_URL}...")
    df_hourly = load_hourly_data(DATABASE_URL)
    print(f"Loaded {len(df_hourly)} hourly rows.")

    print("Building nightly feature dataset...")
    dataset = build_feature_dataset(df_hourly)
    print(f"Feature dataset ready: {len(dataset)} complete nights.")

    print("Identifying nights containing >4-sigma outlier hours...")
    outlier_dates = identify_outlier_nights(df_hourly)
    print(f"Found {len(outlier_dates)} nights with >4-sigma hours.")
    dataset["has_outlier"] = dataset["sweep_date"].apply(lambda d: d in outlier_dates)

    print("\nRunning walk-forward backtest (index 56 to 363, retraining every 7 nights)...")
    results_df, final_m1 = run_walk_forward_backtest(dataset)
    results_df["has_outlier"] = results_df["night_date"].apply(lambda d: d in outlier_dates)
    print(f"Backtest complete. Generated {len(results_df)} forecast evaluation rows.")

    # 1. Performance Tables
    t1_all = compute_performance_metrics(results_df)
    t2_frisat = compute_performance_metrics(results_df[results_df["is_fri_sat"] == True])
    t3_outliers = compute_performance_metrics(results_df[results_df["has_outlier"] == True])

    # 2. Persist to Postgres
    print("\nPersisting forecasts into PostgreSQL forecasts table...")
    persist_forecasts_to_db(results_df, DATABASE_URL)
    print("Forecasts persisted successfully.")

    # 3. Save final fitted model
    model_save_path = models_dir / "m1_quantile_model.joblib"
    joblib.dump(final_m1, model_save_path)
    print(f"Final M1 model saved to {model_save_path}")

    # 4. Generate charts and markdown report
    print("\nGenerating charts and summary report...")
    generate_charts(dataset, results_df, docs_dir)
    print_and_write_results(t1_all, t2_frisat, t3_outliers, docs_dir)


if __name__ == "__main__":
    main()
