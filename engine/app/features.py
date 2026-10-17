"""
features.py: Builds feature matrix and target for nightly buffer forecasting.
Strictly observes no-lookahead: for decision at 17:00 on date D,
only hourly flow rows up through 16:00 on date D and the 17:00 repo contract rate are used.
"""

import datetime
from typing import List, Tuple
import pandas as pd
import numpy as np


FEATURE_COLUMNS = [
    "day_of_week",
    "is_fri",
    "is_sat",
    "is_sun",
    "day_of_month",
    "is_payday",
    "days_since_payday",
    "days_until_payday",
    "month",
    "buffer_lag_1",
    "buffer_lag_7",
    "buffer_lag_14",
    "same_dow_last4_mean",
    "same_dow_last4_max",
    "withdrawals_08_to_16",
    "deposits_08_to_16",
    "net_flow_last_3h",
    "withdrawals_16",
    "repo_rate_17",
]


def _get_payday_distances(dt: datetime.date) -> Tuple[int, int]:
    """
    Computes (days_since_nearest_payday, days_until_nearest_payday).
    Paydays are defined as 1st and 15th of each calendar month.
    """
    year, month = dt.year, dt.month
    candidates: List[datetime.date] = []

    # Prior month paydays
    if month == 1:
        candidates.append(datetime.date(year - 1, 12, 1))
        candidates.append(datetime.date(year - 1, 12, 15))
    else:
        candidates.append(datetime.date(year, month - 1, 1))
        candidates.append(datetime.date(year, month - 1, 15))

    # Current month paydays
    candidates.append(datetime.date(year, month, 1))
    candidates.append(datetime.date(year, month, 15))

    # Next month paydays
    if month == 12:
        candidates.append(datetime.date(year + 1, 1, 1))
        candidates.append(datetime.date(year + 1, 1, 15))
    else:
        candidates.append(datetime.date(year, month + 1, 1))
        candidates.append(datetime.date(year, month + 1, 15))

    past = [c for c in candidates if c <= dt]
    future = [c for c in candidates if c >= dt]

    days_since = (dt - max(past)).days
    days_until = (min(future) - dt).days
    return days_since, days_until


def compute_nightly_targets(df_hourly: pd.DataFrame) -> pd.DataFrame:
    """
    Computes required_buffer_usd for each date D where 17:00 D through 07:00 D+1 exists:
    required_buffer_usd = max(0, -(min cumulative net_flow_usd over the 15 rows))
    """
    df = df_hourly.copy().sort_values("ts").reset_index(drop=True)
    sweep_indices = df[df["repo_sweep_window_open"] == True].index

    nights = []
    for idx in sweep_indices:
        if idx + 15 <= len(df):
            window = df.iloc[idx : idx + 15]
            sweep_ts = window.iloc[0]["ts"]
            cumsum = window["net_flow_usd"].cumsum()
            min_cumsum = cumsum.min()
            req_buffer = max(0.0, -float(min_cumsum))
            nights.append({
                "sweep_date": sweep_ts.date(),
                "sweep_ts": sweep_ts,
                "min_cumulative_net_flow": float(min_cumsum),
                "required_buffer_usd": req_buffer,
            })

    return pd.DataFrame(nights)


def extract_features_for_date(
    d: datetime.date,
    df_hourly: pd.DataFrame,
    target_history: pd.Series,
) -> dict:
    """
    Extracts features for a single sweep date D.
    df_hourly: hourly data available up to D 17:00
    target_history: Series mapping prior dates (d_prior < d) to their actual required_buffer_usd.
    """
    dow = d.weekday()  # 0=Monday, 6=Sunday
    dom = d.day
    month = d.month
    is_fri = 1 if dow == 4 else 0
    is_sat = 1 if dow == 5 else 0
    is_sun = 1 if dow == 6 else 0
    is_payday = 1 if dom in (1, 15) else 0
    days_since_pd, days_until_pd = _get_payday_distances(d)

    # Historical target lags: ONLY dates strictly prior to d
    lag1_d = d - datetime.timedelta(days=1)
    lag7_d = d - datetime.timedelta(days=7)
    lag14_d = d - datetime.timedelta(days=14)

    buf_lag_1 = float(target_history.get(lag1_d, np.nan))
    buf_lag_7 = float(target_history.get(lag7_d, np.nan))
    buf_lag_14 = float(target_history.get(lag14_d, np.nan))

    # Same weekday prior nights: D-7, D-14, D-21, D-28
    same_dow_dates = [d - datetime.timedelta(days=7 * k) for k in (1, 2, 3, 4)]
    same_dow_vals = [target_history.get(sd, np.nan) for sd in same_dow_dates]
    valid_same_dow = [v for v in same_dow_vals if not np.isnan(v)]

    if len(valid_same_dow) > 0:
        same_dow_last4_mean = float(np.mean(valid_same_dow))
        same_dow_last4_max = float(np.max(valid_same_dow))
    else:
        same_dow_last4_mean = np.nan
        same_dow_last4_max = np.nan

    # Today's flows: only hours <= 16:00 on date D
    ts_d = pd.to_datetime(d)
    d_rows = df_hourly[df_hourly["ts"].dt.date == d]

    rows_08_16 = d_rows[d_rows["ts"].dt.hour.isin(range(8, 17))]
    wd_08_16 = float(rows_08_16["withdrawals_usd"].sum()) if not rows_08_16.empty else 0.0
    dep_08_16 = float(rows_08_16["deposits_usd"].sum()) if not rows_08_16.empty else 0.0

    rows_14_16 = d_rows[d_rows["ts"].dt.hour.isin([14, 15, 16])]
    net_last_3h = float(rows_14_16["net_flow_usd"].sum()) if not rows_14_16.empty else 0.0

    row_16 = d_rows[d_rows["ts"].dt.hour == 16]
    wd_16 = float(row_16["withdrawals_usd"].iloc[0]) if not row_16.empty else 0.0

    # Repo rate at 17:00 (contract rate known when executing the sweep)
    row_17 = d_rows[d_rows["ts"].dt.hour == 17]
    repo_rate_17 = float(row_17["tier1_repo_rate_apy"].iloc[0]) if not row_17.empty else 0.0

    return {
        "sweep_date": d,
        "day_of_week": dow,
        "is_fri": is_fri,
        "is_sat": is_sat,
        "is_sun": is_sun,
        "day_of_month": dom,
        "is_payday": is_payday,
        "days_since_payday": days_since_pd,
        "days_until_payday": days_until_pd,
        "month": month,
        "buffer_lag_1": buf_lag_1,
        "buffer_lag_7": buf_lag_7,
        "buffer_lag_14": buf_lag_14,
        "same_dow_last4_mean": same_dow_last4_mean,
        "same_dow_last4_max": same_dow_last4_max,
        "withdrawals_08_to_16": wd_08_16,
        "deposits_08_to_16": dep_08_16,
        "net_flow_last_3h": net_last_3h,
        "withdrawals_16": wd_16,
        "repo_rate_17": repo_rate_17,
    }


def build_feature_dataset(df_hourly: pd.DataFrame) -> pd.DataFrame:
    """
    Builds the complete dataset of 364 complete nights with all features and actual target.
    """
    targets_df = compute_nightly_targets(df_hourly)
    target_history_map = targets_df.set_index("sweep_date")["required_buffer_usd"].to_dict()

    feature_rows = []
    for _, t_row in targets_df.iterrows():
        d = t_row["sweep_date"]
        # History available up to d - 1
        history_series = {k: v for k, v in target_history_map.items() if k < d}
        feats = extract_features_for_date(d, df_hourly, history_series)
        feats["required_buffer_usd"] = t_row["required_buffer_usd"]
        feats["min_cumulative_net_flow"] = t_row["min_cumulative_net_flow"]
        feature_rows.append(feats)

    fdf = pd.DataFrame(feature_rows)
    return fdf
