/**
 * KpiStrip.tsx: Cumulative KPI metrics bar reflecting exact backend metrics:
 * Net P&L, Interest, Break Fees, Overdraft Cost, Overdraft Nights, Payout Success,
 * Net Yield (bps), Oracle Capture Ratio, and the Price of Safety differential.
 */

import React from "react";
import { Award } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { useKpisQuery } from "../hooks/useQueries";
import { StrategyKpi } from "../contract";
import { formatCurrency, formatMillions, formatBps, formatPercent } from "../utils/formatters";

export const KpiStrip: React.FC = () => {
  const replayStatus = useReplayStore((s) => s.replayStatus);
  const latestCumulativeKpis = useReplayStore((s) => s.latestCumulativeKpis);
  const { data: initialKpis } = useKpisQuery();

  const activeStrategy = replayStatus.strategy;
  const isS5 = activeStrategy.includes("cost_optimal");

  // Determine current active strategy KPI object from live settlement or REST query
  const kpiMap = latestCumulativeKpis ?? {};
  let stratKpi: StrategyKpi | undefined = kpiMap[activeStrategy];

  if (!stratKpi && initialKpis?.strategies) {
    stratKpi = initialKpis.strategies.find((s) => s.strategy === activeStrategy);
  }

  // Fallback to S4 if not found
  if (!stratKpi && initialKpis?.strategies) {
    stratKpi = initialKpis.strategies.find((s) => s.strategy === "S4_policy_zero_overdraft");
  }

  // Oracle KPIs for capture ratio
  const oracleKpi =
    kpiMap["S6_oracle"] ??
    initialKpis?.strategies.find((s) => s.strategy === "S6_oracle");

  const s4Kpi =
    kpiMap["S4_policy_zero_overdraft"] ??
    initialKpis?.strategies.find((s) => s.strategy === "S4_policy_zero_overdraft");

  const s5Kpi =
    kpiMap["S5_policy_cost_optimal"] ??
    initialKpis?.strategies.find((s) => s.strategy === "S5_policy_cost_optimal");

  // Price of Safety: S5 net PnL minus S4 net PnL
  const priceOfSafety =
    s5Kpi && s4Kpi ? s5Kpi.net_pnl - s4Kpi.net_pnl : null;

  const captureRatio =
    stratKpi && oracleKpi && oracleKpi.net_pnl > 0
      ? stratKpi.net_pnl / oracleKpi.net_pnl
      : null;

  const overdraftNights = stratKpi ? stratKpi.overdraft_nights : null;
  const payoutRate = stratKpi ? stratKpi.payout_success_rate : null;

  // Addendum 2: In S5, overdraft nights are expected to be non-zero; show as plain number, never in green.
  // In S4: highlight green ONLY when overdraft nights is 0.
  const isOverdraftGreen = !isS5 && overdraftNights === 0;
  const isPayoutGreen = payoutRate === 100.0;

  return (
    <div className="space-y-3">
      {/* Strategy Active Label Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-primary" /> Cumulative Performance:{" "}
          <span className="text-primary font-bold">
            {isS5 ? "cost-optimal (uses overdraft)" : "zero-overdraft policy (default)"}
          </span>
          {stratKpi && <span className="font-mono text-muted-foreground">({stratKpi.nights} nights settled)</span>}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-3">
        {/* Net P&L */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">
            Net P&L
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-foreground tabular-nums block mt-0.5">
            {formatMillions(stratKpi?.net_pnl, 2)}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono block truncate">
            {formatCurrency(stratKpi?.net_pnl, 0)}
          </span>
        </div>

        {/* Total Interest Earned */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">
            Repo Interest
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-foreground tabular-nums block mt-0.5">
            {formatMillions(stratKpi?.interest, 2)}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono block truncate">
            {formatCurrency(stratKpi?.interest, 0)}
          </span>
        </div>

        {/* Break Fees Incurred */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">
            Break Fees
          </span>
          <span
            className={`text-lg sm:text-xl font-extrabold tabular-nums block mt-0.5 ${
              (stratKpi?.break_fees ?? 0) > 0 ? "text-amber-500" : "text-foreground"
            }`}
          >
            {formatCurrency(stratKpi?.break_fees, 0)}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono block">
            {stratKpi ? `${stratKpi.repo_break_nights} nights` : "—"}
          </span>
        </div>

        {/* Overdraft Nights (Constraint: plain number in S5, green only if S4 & 0) */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">
            Overdraft Nights
          </span>
          <span
            className={`text-lg sm:text-xl font-extrabold tabular-nums block mt-0.5 ${
              isOverdraftGreen
                ? "text-success"
                : (overdraftNights ?? 0) > 0
                ? isS5
                  ? "text-foreground" // Plain number for S5, never green
                  : "text-danger"
                : "text-foreground"
            }`}
          >
            {overdraftNights ?? "—"}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono block truncate">
            Cost: {formatCurrency(stratKpi?.overdraft_cost, 0)}
          </span>
        </div>

        {/* Payout Success Rate */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">
            Payout Success
          </span>
          <span
            className={`text-lg sm:text-xl font-extrabold tabular-nums block mt-0.5 ${
              isPayoutGreen ? "text-success" : "text-danger"
            }`}
          >
            {formatPercent(payoutRate, 1)}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono block">
            Target 100.0%
          </span>
        </div>

        {/* Net Yield (bps) */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">
            Annual Yield
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-foreground tabular-nums block mt-0.5">
            {formatBps(stratKpi?.net_yield_bps, 1)}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono block">
            annualized on pool
          </span>
        </div>

        {/* Capture Ratio vs Oracle */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">
            Oracle Capture
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-primary tabular-nums block mt-0.5">
            {captureRatio !== null ? `${(captureRatio * 100).toFixed(1)}%` : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono block">
            vs S6 upper bound
          </span>
        </div>

        {/* Addendum 4: Price of Safety Card */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-primary block tracking-wider">
            Price of Safety
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-primary tabular-nums block mt-0.5">
            {formatMillions(priceOfSafety, 2)}
          </span>
          <span className="text-[9px] text-muted-foreground leading-tight block mt-0.5">
            extra yield if overdraft were allowed
          </span>
        </div>
      </div>
    </div>
  );
};
