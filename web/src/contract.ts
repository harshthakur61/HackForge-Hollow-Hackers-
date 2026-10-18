/**
 * contract.ts: Zod schemas and exported TypeScript types matching docs/API_CONTRACT.md
 * and engine/app/schemas.py.
 */

import { z } from "zod";

// --- REST Schemas ---

export const HealthResponseSchema = z.object({
  status: z.string(),
  db_ok: z.boolean(),
  forecast_nights_count: z.number(),
  first_night: z.string().nullable(),
  last_night: z.string().nullable(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ConfigResponseSchema = z.object({
  pool_usd: z.number(),
  accrual: z.string(),
  policy_mode: z.string(),
  model_for_policy: z.string(),
  default_haircut_pct: z.number(),
  default_overdraft_apr_pct: z.number(),
  q_star_zero_overdraft: z.number(),
  q_star_cost_optimal: z.number(),
});
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;

export const NightsResponseSchema = z.object({
  nights: z.array(z.string()),
});
export type NightsResponse = z.infer<typeof NightsResponseSchema>;

export const ForecastItemSchema = z.object({
  model: z.string(),
  quantile: z.number(),
  buffer_usd: z.number(),
});
export type ForecastItem = z.infer<typeof ForecastItemSchema>;

export const ForecastResponseSchema = z.object({
  night_date: z.string(),
  forecasts: z.array(ForecastItemSchema),
});
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;

export const DecisionDetailsSchema = z.object({
  buffer_usd: z.number(),
  sweep_usd: z.number(),
  quantile_used: z.number(),
  model: z.string(),
  reason: z.string(),
  q_star_zero: z.number(),
  q_star_opt: z.number(),
});
export type DecisionDetails = z.infer<typeof DecisionDetailsSchema>;

export const NightResultSchema = z.object({
  interest: z.number(),
  break_fee: z.number(),
  broken_amount: z.number(),
  overdraft_peak: z.number(),
  overdraft_cost: z.number(),
  net_pnl: z.number(),
  shortfall_peak: z.number(),
  payouts_honored: z.boolean(),
  idle_cash_at_17: z.number(),
});
export type NightResult = z.infer<typeof NightResultSchema>;

export const TraceRowSchema = z.object({
  ts: z.string(),
  deposits: z.number(),
  withdrawals: z.number(),
  net_flow: z.number(),
  cash: z.number(),
  repo: z.number(),
  overdraft: z.number(),
  event: z.string().nullable(),
  event_amount: z.number(),
  event_fee: z.number(),
});
export type TraceRow = z.infer<typeof TraceRowSchema>;

export const NightDetailResponseSchema = z.object({
  night_date: z.string(),
  strategy: z.string(),
  is_custom: z.boolean(),
  decision: DecisionDetailsSchema,
  result: NightResultSchema,
  actual_required_usd: z.number(),
  trace: z.array(TraceRowSchema),
});
export type NightDetailResponse = z.infer<typeof NightDetailResponseSchema>;

export const StrategyKpiSchema = z.object({
  strategy: z.string(),
  nights: z.number(),
  interest: z.number(),
  break_fees: z.number(),
  overdraft_cost: z.number(),
  net_pnl: z.number(),
  net_yield_bps: z.number(),
  mean_buffer: z.number(),
  repo_break_nights: z.number(),
  overdraft_nights: z.number(),
  payout_success_rate: z.number(),
});
export type StrategyKpi = z.infer<typeof StrategyKpiSchema>;

export const KpisResponseSchema = z.object({
  through: z.string(),
  strategies: z.array(StrategyKpiSchema),
});
export type KpisResponse = z.infer<typeof KpisResponseSchema>;

export const DecisionLogRowSchema = z.object({
  night_date: z.string(),
  strategy: z.string(),
  model: z.string(),
  quantile_used: z.number(),
  buffer_usd: z.number(),
  sweep_usd: z.number(),
  repo_apy: z.number(),
  reason: z.string(),
  interest: z.number(),
  break_fee: z.number(),
  overdraft_cost: z.number(),
  net_pnl: z.number(),
});
export type DecisionLogRow = z.infer<typeof DecisionLogRowSchema>;

export const DecisionsResponseSchema = z.object({
  decisions: z.array(DecisionLogRowSchema),
});
export type DecisionsResponse = z.infer<typeof DecisionsResponseSchema>;

// --- WebSocket Event Schemas ---

export const ReplayStatusSchema = z.object({
  state: z.enum(["idle", "playing", "paused", "finished"]),
  simTime: z.string(),
  tickMs: z.number(),
  strategy: z.string(),
  mode: z.string(),
  nightDate: z.string(),
});
export type ReplayStatus = z.infer<typeof ReplayStatusSchema>;

export const ReplayTickSchema = z.object({
  ts: z.string(),
  phase: z.enum(["day", "night"]),
  simulated: z.boolean(),
  deposits: z.number(),
  withdrawals: z.number(),
  net_flow: z.number(),
  balances: z.object({
    cash: z.number(),
    repo: z.number(),
    overdraft: z.number(),
  }),
  repo_apy: z.number(),
  sleeve: z
    .object({
      repo: z.number(),
      bonds: z.number(),
      equities: z.number(),
      carry: z.number(),
      total: z.number(),
      benchmark: z.number(),
      cum_excess: z.number(),
    })
    .optional(),
});
export type ReplayTick = z.infer<typeof ReplayTickSchema>;

export const DecisionEventSchema = z.object({
  night_date: z.string(),
  decision: DecisionDetailsSchema,
  forecasts: z.array(ForecastItemSchema),
  pool: z.number(),
  q_star: z.number(),
});
export type DecisionEvent = z.infer<typeof DecisionEventSchema>;

export const ReplayEventSchema = z.object({
  ts: z.string(),
  type: z.enum(["repo_break", "bond_sale", "equity_sale", "overdraft", "alert"]),
  amount: z.number(),
  fee: z.number(),
  message: z.string(),
});
export type ReplayEvent = z.infer<typeof ReplayEventSchema>;

export const SettlementEventSchema = z.object({
  night_date: z.string(),
  interest: z.number(),
  break_fee: z.number(),
  overdraft_cost: z.number(),
  net_pnl: z.number(),
  actual_required_usd: z.number(),
  forecast_buffer_usd: z.number(),
  covered: z.boolean(),
  cumulative: z.record(z.string(), StrategyKpiSchema),
  sleeve: z.record(z.string(), z.any()).optional(),
});
export type SettlementEvent = z.infer<typeof SettlementEventSchema>;

export const ConfigSetPayloadSchema = z.object({
  strategy: z.string().optional(),
  mode: z.enum(["zero_overdraft", "cost_optimal"]).optional(),
  quantile: z.number().optional(),
  pool: z.number().optional(),
  sleeve_preset: z.string().optional(),
  sleeve_weights: z.record(z.string(), z.number()).optional(),
  sleeve_usd: z.number().optional(),
});
export type ConfigSetPayload = z.infer<typeof ConfigSetPayloadSchema>;

// --- Stress Testing Schemas ---

export const WaterfallEventSchema = z.object({
  ts: z.string(),
  type: z.string(),
  amount: z.number(),
  fee: z.number(),
});
export type WaterfallEvent = z.infer<typeof WaterfallEventSchema>;

export const StressDeltasSchema = z.object({
  net_pnl: z.number(),
  break_fee: z.number(),
  overdraft_cost: z.number(),
  broken_amount: z.number(),
  overdraft_peak: z.number(),
  shortfall_peak: z.number(),
  interest: z.number(),
});
export type StressDeltas = z.infer<typeof StressDeltasSchema>;

export const StressNightRequestSchema = z.object({
  night_date: z.string(),
  scenario: z.string(),
  params: z.record(z.string(), z.any()),
  strategy: z.string().optional(),
  mode: z.string().optional(),
  informed: z.boolean().optional(),
  sleeve_weights: z.record(z.string(), z.number()).optional(),
  sleeve_preset: z.string().optional(),
  sleeve_usd: z.number().optional(),
});
export type StressNightRequest = z.infer<typeof StressNightRequestSchema>;

export const StressNightResponseSchema = z.object({
  night_date: z.string(),
  scenario: z.string(),
  params: z.record(z.string(), z.any()),
  strategy: z.string(),
  mode: z.string(),
  informed: z.boolean(),
  baseline_decision: DecisionDetailsSchema,
  stressed_decision: DecisionDetailsSchema,
  baseline_result: NightResultSchema,
  stressed_result: NightResultSchema,
  deltas: StressDeltasSchema,
  baseline_trace: z.array(TraceRowSchema),
  stressed_trace: z.array(TraceRowSchema),
  waterfall_events: z.array(WaterfallEventSchema).optional(),
});
export type StressNightResponse = z.infer<typeof StressNightResponseSchema>;

export const StressBatchRequestSchema = z.object({
  scenario: z.string(),
  params: z.record(z.string(), z.any()),
  informed: z.boolean().optional(),
  night_filter: z.string().optional(),
  sleeve_weights: z.record(z.string(), z.number()).optional(),
  sleeve_preset: z.string().optional(),
  sleeve_usd: z.number().optional(),
});
export type StressBatchRequest = z.infer<typeof StressBatchRequestSchema>;

export const StressBatchStrategyRowSchema = z.object({
  strategy: z.string(),
  net_pnl: z.number(),
  break_fee: z.number(),
  overdraft_cost: z.number(),
  repo_break_nights: z.number(),
  overdraft_nights: z.number(),
  worst_shortfall: z.number(),
  baseline_net_pnl: z.number(),
  baseline_break_fee: z.number(),
  baseline_overdraft_cost: z.number(),
  baseline_repo_break_nights: z.number(),
  baseline_overdraft_nights: z.number(),
  baseline_worst_shortfall: z.number(),
  delta_net_pnl: z.number(),
  delta_break_fee: z.number(),
  delta_overdraft_cost: z.number(),
  delta_repo_break_nights: z.number(),
  delta_overdraft_nights: z.number(),
  delta_worst_shortfall: z.number(),
});
export type StressBatchStrategyRow = z.infer<typeof StressBatchStrategyRowSchema>;

export const StressBatchResponseSchema = z.object({
  scenario: z.string(),
  params: z.record(z.string(), z.any()),
  informed: z.boolean(),
  night_filter: z.string(),
  nights_count: z.number(),
  summary_text: z.string(),
  results: z.array(StressBatchStrategyRowSchema),
});
export type StressBatchResponse = z.infer<typeof StressBatchResponseSchema>;

// --- Strategic Sleeve Schemas ---

export const SleeveWeightsSchema = z.object({
  repo: z.number(),
  bonds: z.number(),
  equity: z.number(),
});
export type SleeveWeights = z.infer<typeof SleeveWeightsSchema>;

export const SleeveWorkingSchema = z.object({
  T: z.number(),
  z99: z.number(),
  h_days: z.number(),
  sigma: z.number(),
  equity_haircut_pct: z.number(),
  L_e: z.number(),
  D_mod: z.number(),
  yield_shock_bp: z.number(),
  bond_haircut_pct: z.number(),
  L_b: z.number(),
  repo_floor: z.number(),
  weights: SleeveWeightsSchema,
});
export type SleeveWorking = z.infer<typeof SleeveWorkingSchema>;

export const SleeveConfigResponseSchema = z.object({
  sleeve_usd: z.number(),
  presets: z.record(z.string(), SleeveWeightsSchema),
  preset_labels: z.record(z.string(), z.string()),
  parameters: z.record(z.string(), z.any()),
  risk_budget_working: SleeveWorkingSchema,
});
export type SleeveConfigResponse = z.infer<typeof SleeveConfigResponseSchema>;

export const SleeveHourlyRowSchema = z.object({
  ts: z.string(),
  repo_mv: z.number(),
  bond_clean_mv: z.number(),
  bond_carry: z.number(),
  equity_mv: z.number(),
  total_mv: z.number(),
  benchmark_mv: z.number(),
  excess_vs_repo: z.number(),
  drawdown_from_peak: z.number(),
});
export type SleeveHourlyRow = z.infer<typeof SleeveHourlyRowSchema>;

export const BreakEvenHoldingPeriodSchema = z.object({
  bonds: z.number().nullable().optional(),
  equity: z.number().nullable().optional(),
});
export type BreakEvenHoldingPeriod = z.infer<typeof BreakEvenHoldingPeriodSchema>;

export const SleeveSummarySchema = z.object({
  total_return: z.number(),
  annualised_return: z.number(),
  pnl: z.number(),
  excess_pnl_vs_repo: z.number(),
  annualised_volatility_daily: z.number(),
  max_drawdown_amount: z.number(),
  max_drawdown_pct: z.number(),
  worst_24h_change: z.number(),
  liquidation_adjusted_end: z.number(),
  liquidation_adjusted_worst: z.number(),
  break_even_ex_ante_years: BreakEvenHoldingPeriodSchema,
  break_even_ex_post_years: BreakEvenHoldingPeriodSchema,
});
export type SleeveSummary = z.infer<typeof SleeveSummarySchema>;

export const SleevePathResponseSchema = z.object({
  preset: z.string().nullable().optional(),
  sleeve_usd: z.number(),
  weights: SleeveWeightsSchema,
  path: z.array(SleeveHourlyRowSchema),
  summary: SleeveSummarySchema,
});
export type SleevePathResponse = z.infer<typeof SleevePathResponseSchema>;

export const SleeveCompareResultItemSchema = z.object({
  weights: SleeveWeightsSchema,
  summary: SleeveSummarySchema,
});
export type SleeveCompareResultItem = z.infer<typeof SleeveCompareResultItemSchema>;

export const SleeveCompareResponseSchema = z.object({
  through: z.string(),
  sleeve_usd: z.number(),
  results: z.record(z.string(), SleeveCompareResultItemSchema),
});
export type SleeveCompareResponse = z.infer<typeof SleeveCompareResponseSchema>;
