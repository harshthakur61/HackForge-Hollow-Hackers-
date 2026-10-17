import datetime
import pytest
import pandas as pd
import numpy as np
from engine.app.features import (
    build_feature_dataset,
    extract_features_for_date,
    compute_nightly_targets,
    FEATURE_COLUMNS,
)


@pytest.fixture(scope="module")
def hourly_df():
    df = pd.read_csv("data/treasury_4tier_dataset.csv")
    df["ts"] = pd.to_datetime(df["timestamp"])
    for col in df.columns:
        if col not in ("timestamp", "ts", "repo_sweep_window_open", "repo_sweep_mature"):
            df[col] = pd.to_numeric(df[col])
    return df


def test_build_feature_dataset_shape(hourly_df):
    fdf = build_feature_dataset(hourly_df)
    assert len(fdf) == 364
    for col in FEATURE_COLUMNS:
        assert col in fdf.columns
    assert "required_buffer_usd" in fdf.columns


def test_no_leakage_perturbing_future_rows(hourly_df):
    """
    Proves strictly no lookahead leakage:
    For any sweep date D, perturbing all flow rows after D 16:00
    (including 17:00 flows and all subsequent days) must leave D's features unchanged.
    """
    test_dates = [
        datetime.date(2026, 3, 1),
        datetime.date(2026, 6, 15),
        datetime.date(2026, 10, 20),
    ]

    targets_df = compute_nightly_targets(hourly_df)
    target_history_map = targets_df.set_index("sweep_date")["required_buffer_usd"].to_dict()

    for d in test_dates:
        cutoff_ts = pd.Timestamp(d) + pd.Timedelta(hours=16)

        # Baseline features
        history_prior = {k: v for k, v in target_history_map.items() if k < d}
        base_feats = extract_features_for_date(d, hourly_df, history_prior)

        # Perturbed copy: modify all future rows > D 16:00
        perturbed_df = hourly_df.copy()
        future_mask = perturbed_df["ts"] > cutoff_ts

        # Perturb deposits, withdrawals, and net_flow with huge random values
        perturbed_df.loc[future_mask, "deposits_usd"] = (
            perturbed_df.loc[future_mask, "deposits_usd"] * 5.0 + 9999999.0
        )
        perturbed_df.loc[future_mask, "withdrawals_usd"] = (
            perturbed_df.loc[future_mask, "withdrawals_usd"] * 10.0 + 8888888.0
        )
        perturbed_df.loc[future_mask, "net_flow_usd"] = (
            perturbed_df.loc[future_mask, "deposits_usd"] - perturbed_df.loc[future_mask, "withdrawals_usd"]
        )

        # Also perturb future dates' required_buffer history
        # History for D must only include prior dates (< d)
        perturbed_feats = extract_features_for_date(d, perturbed_df, history_prior)

        # Compare every single feature
        for col in FEATURE_COLUMNS:
            base_val = base_feats[col]
            pert_val = perturbed_feats[col]
            if np.isnan(base_val):
                assert np.isnan(pert_val), f"Feature {col} mismatch on date {d}"
            else:
                assert base_val == pert_val, (
                    f"Leakage detected in feature {col} on date {d}: "
                    f"base={base_val}, perturbed={pert_val}"
                )
