import pytest
import numpy as np
import pandas as pd
from engine.app.models import (
    predict_b0_static,
    predict_b1_same_weekday,
    predict_b2_max_last4_same_dow,
    ConformalShiftTracker,
)


def test_b0_static_quantile():
    targets = pd.Series([10.0, 20.0, 30.0, 40.0, 50.0])
    p50 = predict_b0_static(targets, 0.5)
    assert p50 == 30.0
    p90 = predict_b0_static(targets, 0.9)
    assert p90 == 46.0


def test_b1_same_weekday():
    df = pd.DataFrame({
        "day_of_week": [0, 1, 0, 1, 0],
        "required_buffer_usd": [100.0, 50.0, 200.0, 60.0, 300.0],
    })
    # For Monday (dow=0), values are 100, 200, 300 -> median 200
    p50 = predict_b1_same_weekday(df, 0, 0.5)
    assert p50 == 200.0


def test_b2_max_last4_same_dow():
    df = pd.DataFrame({
        "day_of_week": [4] * 6,
        "required_buffer_usd": [10.0, 20.0, 50.0, 30.0, 40.0, 25.0],
    })
    # Last 4 for Friday: 50, 30, 40, 25 -> max 50
    m = predict_b2_max_last4_same_dow(df, 4)
    assert m == 50.0


def test_conformal_shift_tracker():
    tracker = ConformalShiftTracker(window_size=60, min_history=30)
    # With fewer than 30 residuals, shift should not be applied
    for i in range(20):
        tracker.update(0.95, actual=100.0, forecast_m1=80.0)
    shifted = tracker.apply_shift(0.95, 80.0)
    assert shifted == 80.0

    # Add 15 more so total = 35 >= 30
    for i in range(15):
        tracker.update(0.95, actual=100.0, forecast_m1=80.0)  # residual = +20.0
    shifted_active = tracker.apply_shift(0.95, 80.0)
    assert shifted_active == 100.0  # 80.0 + 20.0 = 100.0
