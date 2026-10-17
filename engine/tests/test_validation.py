import pytest
import pandas as pd
from engine.scripts.load_csv import validate_data


def test_validation_passes_on_real_csv():
    df = pd.read_csv("data/treasury_4tier_dataset.csv")
    validated = validate_data(df)
    assert len(validated) == 8760
    assert validated["repo_sweep_window_open"].dtype == bool
    assert validated["repo_sweep_mature"].dtype == bool


def test_validation_fails_on_wrong_row_count():
    df = pd.read_csv("data/treasury_4tier_dataset.csv").iloc[:100]
    with pytest.raises(ValueError, match="Expected exactly 8760 rows"):
        validate_data(df)


def test_validation_fails_on_null_values():
    df = pd.read_csv("data/treasury_4tier_dataset.csv")
    df.loc[10, "deposits_usd"] = None
    with pytest.raises(ValueError, match="contains null values"):
        validate_data(df)


def test_validation_fails_on_duplicate_timestamps():
    df = pd.read_csv("data/treasury_4tier_dataset.csv")
    df.loc[1, "timestamp"] = df.loc[0, "timestamp"]
    with pytest.raises(ValueError, match="Duplicate timestamps found"):
        validate_data(df)


def test_validation_fails_on_unsorted_timestamps():
    df = pd.read_csv("data/treasury_4tier_dataset.csv")
    row0 = df.iloc[0].copy()
    row1 = df.iloc[1].copy()
    df.iloc[0] = row1
    df.iloc[1] = row0
    with pytest.raises(ValueError, match="not strictly sorted"):
        validate_data(df)


def test_validation_fails_on_negative_deposits():
    df = pd.read_csv("data/treasury_4tier_dataset.csv")
    df.loc[5, "deposits_usd"] = -100.0
    with pytest.raises(ValueError, match="negative deposits_usd"):
        validate_data(df)


def test_validation_fails_on_net_flow_mismatch():
    df = pd.read_csv("data/treasury_4tier_dataset.csv")
    df.loc[5, "net_flow_usd"] += 1.0  # > 0.05 mismatch
    with pytest.raises(ValueError, match="differs from"):
        validate_data(df)


def test_validation_fails_on_invalid_repo_sweep_window():
    df = pd.read_csv("data/treasury_4tier_dataset.csv")
    # Set window open at 16:00
    df.loc[df["timestamp"] == "2026-01-01 16:00:00", "repo_sweep_window_open"] = True
    with pytest.raises(ValueError, match="non-17:00 hours"):
        validate_data(df)


def test_validation_fails_on_invalid_repo_sweep_mature():
    df = pd.read_csv("data/treasury_4tier_dataset.csv")
    # Set mature at 09:00
    df.loc[df["timestamp"] == "2026-01-01 09:00:00", "repo_sweep_mature"] = True
    with pytest.raises(ValueError, match="non-08:00 hours"):
        validate_data(df)
