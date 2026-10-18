/**
 * labels.ts: Single typed source of truth for strategy identifiers, labels,
 * descriptions, and forecasting model code translations across the console.
 * Used everywhere: KPI strip, strategy race, strategy performance, stress lab,
 * decision log, methodology, docs/DESIGN_SYSTEM.md.
 */

export const CONTRACT_STRATEGY_IDS = [
  "S0_all_cash",
  "S1_fixed_10",
  "S2_fixed_20",
  "S3_static",
  "S4_policy_zero_overdraft",
  "S5_policy_cost_optimal",
  "S6_oracle",
] as const;

export type StrategyKey = (typeof CONTRACT_STRATEGY_IDS)[number];

export const STRATEGY_LABELS: Record<StrategyKey, string> = {
  S0_all_cash: "S0 All cash",
  S1_fixed_10: "S1 Fixed 10% buffer",
  S2_fixed_20: "S2 Fixed 20% buffer",
  S3_static: "S3 Static quantile buffer",
  S4_policy_zero_overdraft: "S4 Zero-overdraft policy (default)",
  S5_policy_cost_optimal: "S5 Cost-optimal policy (uses overdraft)",
  S6_oracle: "S6 Oracle (upper bound, not deployable)",
};

export const ALL_STRATEGY_KEYS = CONTRACT_STRATEGY_IDS;

export const STRATEGY_DESCRIPTIONS: Record<StrategyKey, string> = {
  S0_all_cash: "Zero repo sweep; 100% held in cash. Zero interest yield and zero liquidity penalty.",
  S1_fixed_10: "Fixed 10% cash reserve; sweeps 90% into overnight repo. Frequent emergency overdrafts.",
  S2_fixed_20: "Fixed 20% cash reserve; sweeps 80% into overnight repo.",
  S3_static: "Static historical quantile buffer (P98) without weekday or flow shock adjustments.",
  S4_policy_zero_overdraft: "Dynamically calibrated buffer to minimize overdraft penalty exposure.",
  S5_policy_cost_optimal: "Balances repo early-break haircut against emergency overdraft penalty APR.",
  S6_oracle: "Theoretical upper bound with perfect foresight of exact overnight trough (not deployable).",
};

/**
 * Returns the institutional display label for a given strategy key or short code.
 * Accepts full keys (e.g. "S4_policy_zero_overdraft") or short codes (e.g. "S4").
 */
export function getStrategyLabel(keyOrCode: string): string {
  if (keyOrCode in STRATEGY_LABELS) {
    return STRATEGY_LABELS[keyOrCode as StrategyKey];
  }
  // Try matching prefix if short code passed (e.g. "S4" -> "S4_policy_zero_overdraft")
  const match = ALL_STRATEGY_KEYS.find(
    (k) => k === keyOrCode || k.startsWith(keyOrCode + "_")
  );
  if (match) {
    return STRATEGY_LABELS[match];
  }
  return keyOrCode;
}

/**
 * Model code translations per specification:
 * - B0: "Static historical quantile"
 * - B1: "Same-weekday historical quantile forecast"
 * - B2: "Recent same-weekday maximum"
 * - M1: "XGBoost quantile model"
 * - M2: "XGBoost quantile model with conformal calibration"
 * Unknown codes fallback to the raw code.
 */
export const MODEL_CODE_LABELS: Record<string, string> = {
  B0: "Static historical quantile",
  B1: "Same-weekday historical quantile forecast",
  B2: "Recent same-weekday maximum",
  M1: "XGBoost quantile model",
  M2: "XGBoost quantile model with conformal calibration",
};

export function getModelLabel(code: string): string {
  return MODEL_CODE_LABELS[code] || code;
}

/**
 * Institutional Tier Labels & Descriptions
 */
export const TIER_LABELS: Record<string, string> = {
  tier0: "Tier 0 Cash (demand liquidity)",
  tier1: "Tier 1 Repo (operating pool sweep)",
  tier2: "Tier 2 Bonds (strategic sleeve)",
  tier3: "Tier 3 Equities (strategic sleeve)",
};

export const TIER_SHORT_LABELS: Record<string, string> = {
  tier0: "Cash",
  tier1: "Repo (operating)",
  tier2: "Bonds (strategic sleeve)",
  tier3: "Equities (strategic sleeve)",
};

/**
 * Sleeve Preset Labels & Descriptions
 */
export const SLEEVE_PRESET_LABELS: Record<string, string> = {
  risk_budget: "Risk Budget (Default)",
  conservative: "Conservative (100/0/0)",
  income: "Income (50/50/0)",
  balanced: "Balanced (40/40/20)",
  growth: "Growth (20/30/50)",
  custom: "Custom Allocation",
};

export const SLEEVE_PRESET_DESCRIPTIONS: Record<string, string> = {
  risk_budget: "Ex-ante 50/50 risk budget based on starting volatility & duration. Max 5% stressed loss.",
  conservative: "100% Overnight Repo, 0% Bonds, 0% Equities. Capital preservation illustration.",
  income: "50% Overnight Repo, 50% 2Y Government Bonds. Yield enhancement illustration.",
  balanced: "40% Repo, 40% Bonds, 20% Equities. Balanced diversification illustration.",
  growth: "20% Repo (floor), 30% Bonds, 50% Equities. Equity-heavy growth illustration.",
  custom: "Custom weights with minimum 20% repo floor enforced.",
};

export function getSleevePresetLabel(presetKey: string): string {
  return SLEEVE_PRESET_LABELS[presetKey] || presetKey;
}

/**
 * Mandatory Honesty Labels per Project Specification
 */
export const HONESTY_DISCLOSURES = {
  NOT_A_FORECAST: "Realised over this dataset's year; not a forecast.",
  EQUITY_EXPECTED_RETURN:
    "Equity expected return of about 10% is stated in the problem brief, not in the dataset, and is not used in realised figures.",
  PRESETS_IN_SAMPLE: "Presets are in-sample illustrations, not tuned.",
  SEPARATE_CAPITAL:
    "The sleeve is separate capital held outside the nightly pool; no dividends or transaction costs.",
  LIQUIDATION_ADJUSTED_DEF:
    "Liquidation-adjusted value = repo + bonds × (1 - 2.0%) + equities × (1 - 15.0%). Represents immediate stressed salvage value.",
} as const;
