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
  type: z.enum(["repo_break", "overdraft", "alert"]),
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
});
export type SettlementEvent = z.infer<typeof SettlementEventSchema>;

export const ConfigSetPayloadSchema = z.object({
  strategy: z.string().optional(),
  mode: z.enum(["zero_overdraft", "cost_optimal"]).optional(),
  quantile: z.number().optional(),
  pool: z.number().optional(),
});
export type ConfigSetPayload = z.infer<typeof ConfigSetPayloadSchema>;
