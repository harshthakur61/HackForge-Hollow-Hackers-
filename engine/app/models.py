"""
models.py: Forecasting models and baselines for overnight required buffer.
Includes:
- B0: Static empirical quantile of all prior nights
- B1: Same-weekday empirical quantile of prior nights
- B2: Max of the last 4 same-weekday nights
- M1: XGBoost quantile regression (reg:quantileerror)
- M2: M1 + rolling out-of-sample conformal quantile shift
"""

from typing import Dict, List, Optional
import numpy as np
import pandas as pd
import xgboost as xgb
from engine.app.features import FEATURE_COLUMNS


def predict_b0_static(prior_targets: pd.Series, quantile: float) -> float:
    """
    B0 Static baseline: empirical quantile of all prior nights.
    """
    if len(prior_targets) == 0:
        return 0.0
    return float(np.percentile(prior_targets, quantile * 100.0))


def predict_b1_same_weekday(
    prior_df: pd.DataFrame, dow: int, quantile: float
) -> float:
    """
    B1 Same-weekday baseline: empirical quantile of prior nights on the same day-of-week.
    """
    same_dow = prior_df[prior_df["day_of_week"] == dow]["required_buffer_usd"]
    if len(same_dow) > 0:
        return float(np.percentile(same_dow, quantile * 100.0))
    # Fallback to B0 if no same-weekday history exists
    return predict_b0_static(prior_df["required_buffer_usd"], quantile)


def predict_b2_max_last4_same_dow(prior_df: pd.DataFrame, dow: int) -> float:
    """
    B2 baseline: max of the last 4 same-weekday nights.
    Deterministic rule (same value across all quantiles).
    """
    same_dow = prior_df[prior_df["day_of_week"] == dow]["required_buffer_usd"]
    if len(same_dow) == 0:
        return 0.0
    last4 = same_dow.iloc[-4:]
    return float(last4.max())


class M1QuantileModel:
    """
    M1: XGBoost Regressor trained with quantile objective (reg:quantileerror).
    Parameters:
      - tree_method: 'hist'
      - max_depth: 2
      - n_estimators: 200
      - learning_rate: 0.05
      - subsample: 0.8
      - random_state: 42
    One model trained per target quantile.
    """

    def __init__(self, quantiles: List[float] = [0.5, 0.9, 0.95, 0.98, 0.99]):
        self.quantiles = quantiles
        self.models: Dict[float, xgb.XGBRegressor] = {}

    def fit(self, X_train: pd.DataFrame, y_train: pd.Series):
        X = X_train[FEATURE_COLUMNS]
        for q in self.quantiles:
            model = xgb.XGBRegressor(
                objective="reg:quantileerror",
                quantile_alpha=q,
                tree_method="hist",
                max_depth=2,
                n_estimators=200,
                learning_rate=0.05,
                subsample=0.8,
                random_state=42,
            )
            model.fit(X, y_train)
            self.models[q] = model

    def predict(self, X_eval: pd.DataFrame) -> Dict[float, np.ndarray]:
        X = X_eval[FEATURE_COLUMNS]
        preds = {}
        for q, model in self.models.items():
            pred = model.predict(X)
            preds[q] = np.maximum(0.0, pred)
        return preds

    def predict_single(self, row: pd.Series) -> Dict[float, float]:
        X = pd.DataFrame([row])[FEATURE_COLUMNS]
        preds = {}
        for q, model in self.models.items():
            pred = float(model.predict(X)[0])
            preds[q] = max(0.0, pred)
        return preds


class ConformalShiftTracker:
    """
    Tracks out-of-sample residuals (actual - forecast_M1) for M2.
    Applies empirical q-quantile of residuals over the last 60 out-of-sample nights
    only once at least 30 out-of-sample nights exist.
    """

    def __init__(self, window_size: int = 60, min_history: int = 30):
        self.window_size = window_size
        self.min_history = min_history
        # Mapping from quantile to list of out-of-sample residuals
        self.residuals: Dict[float, List[float]] = {}

    def update(self, quantile: float, actual: float, forecast_m1: float):
        if quantile not in self.residuals:
            self.residuals[quantile] = []
        residual = actual - forecast_m1
        self.residuals[quantile].append(residual)

    def apply_shift(self, quantile: float, forecast_m1: float) -> float:
        history = self.residuals.get(quantile, [])
        if len(history) < self.min_history:
            return max(0.0, forecast_m1)

        recent = history[-self.window_size :]
        shift = float(np.percentile(recent, quantile * 100.0))
        return max(0.0, forecast_m1 + shift)
