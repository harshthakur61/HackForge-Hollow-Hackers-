/**
 * KpiStrip.tsx: Cumulative KPI metrics bar reflecting exact backend metrics:
 * Net P&L (visually primary), Interest, Break Fees, Overdraft Nights, Repo-Break Nights,
 * Payout Success, and the Price of Safety differential.
 * Includes Strategic Sleeve P&L, Excess vs repo-only, and combined Operating pool (S4) + sleeve line.
 * Overdraft nights and payout success are rendered as plain figures, never green decoration.
 */

import React from "react";
import { Award, Layers } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { useKpisQuery } from "../hooks/useQueries";
import { StrategyKpi } from "../contract";
import { formatCurrency, formatMillions, formatPercent } from "../utils/formatters";
import { getStrategyLabel } from "../utils/labels";
import Tooltip from "./common/Tooltip";
import SignedMoney from "./common/SignedMoney";

export const KpiStrip: React.FC = () => {
  const replayStatus = useReplayStore((s) => s.replayStatus);
  const latestCumulativeKpis = useReplayStore((s) => s.latestCumulativeKpis);
  const latestSleevePoint = useReplayStore((s) => s.latestSleevePoint);
  const latestSleeveSettlement = useReplayStore((s) => s.latestSleeveSettlement);
  const sleeveConfig = useReplayStore((s) => s.sleeveConfig);
  const { data: initialKpis } = useKpisQuery();

  const activeStrategy = replayStatus.strategy;

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

  const s4Kpi =
    kpiMap["S4_policy_zero_overdraft"] ??
    initialKpis?.strategies.find((s) => s.strategy === "S4_policy_zero_overdraft");

  const s5Kpi =
    kpiMap["S5_policy_cost_optimal"] ??
    initialKpis?.strategies.find((s) => s.strategy === "S5_policy_cost_optimal");

  // Price of Safety: S5 net PnL minus S4 net PnL
  const priceOfSafety =
    s5Kpi && s4Kpi ? s5Kpi.net_pnl - s4Kpi.net_pnl : null;

  // Strategic sleeve metrics from server released tick / settlement
  const sleeveUsd = sleeveConfig.sleeve_usd ?? 50_000_000;
  const sleevePnl =
    latestSleeveSettlement?.pnl ??
    (latestSleevePoint ? latestSleevePoint.total - sleeveUsd : null);
  const sleeveExcess =
    latestSleeveSettlement?.cum_excess ??
    latestSleevePoint?.cum_excess ??
    null;

  // Combined line: Operating pool (S4) + sleeve (simple sum of two separate capital pools)
  const combinedPnl =
    s4Kpi && sleevePnl !== null ? s4Kpi.net_pnl + sleevePnl : null;

  return (
    <div className="space-y-3">
      {/* Strategy Active Label Header */}
      <div className="flex items-center justify-between text-xs text-text-secondary px-1">
        <span className="font-semibold text-text-primary flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-accent-primary" aria-hidden="true" />
          <span>Cumulative Performance Basis:</span>
          <span className="text-accent-primary font-bold">
            {getStrategyLabel(activeStrategy)}
          </span>
          {stratKpi && (
            <span className="font-mono text-text-muted">
              ({stratKpi.nights} nights settled)
            </span>
          )}
        </span>
      </div>

      {/* Primary Operating Pool KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 sm:gap-3">
        {/* Net P&L (Visually Primary: 1st card with distinct primary border and prominence) */}
        <div className="col-span-2 sm:col-span-1 bg-surface border-2 border-accent-primary rounded-md p-3 shadow-xs">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Net P&L</span>
            <span className="text-[10px] px-1 py-0.2 rounded-xs bg-accent-subtle text-accent-primary font-semibold">
              Primary
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-text-primary tabular-nums block">
            <SignedMoney value={stratKpi?.net_pnl} compact decimals={2} />
          </div>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            {formatCurrency(stratKpi?.net_pnl, 2)}
          </span>
        </div>

        {/* Total Repo Interest */}
        <div className="bg-surface border border-border-subtle rounded-md p-3">
          <span className="text-2xs uppercase font-bold text-text-secondary block tracking-wider mb-1">
            Repo Interest
          </span>
          <span className="text-base sm:text-lg font-bold text-text-primary tabular-nums block">
            {formatMillions(stratKpi?.interest, 2)}
          </span>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            {formatCurrency(stratKpi?.interest, 0)}
          </span>
        </div>

        {/* Repo Break Fees */}
        <div className="bg-surface border border-border-subtle rounded-md p-3">
          <span className="text-2xs uppercase font-bold text-text-secondary block tracking-wider mb-1">
            Break Fees
          </span>
          <span className={`text-base sm:text-lg font-bold tabular-nums block ${stratKpi && stratKpi.break_fees > 0 ? "text-neg" : "text-text-primary"}`}>
            {formatMillions(stratKpi?.break_fees, 2)}
          </span>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            {formatCurrency(stratKpi?.break_fees, 0)}
          </span>
        </div>

        {/* Overdraft Nights (Plain figure, NEVER green decoration) */}
        <div className="bg-surface border border-border-subtle rounded-md p-3">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Overdraft Nights</span>
            <Tooltip content="Nights where cumulative client withdrawals exceeded buffer and repo, triggering emergency overdraft." />
          </div>
          <span className="text-base sm:text-lg font-bold text-text-primary tabular-nums block font-mono">
            {stratKpi ? stratKpi.overdraft_nights : "—"}
          </span>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            {stratKpi && stratKpi.overdraft_cost > 0 ? `${formatCurrency(stratKpi.overdraft_cost, 0)} fee` : "0 penalty"}
          </span>
        </div>

        {/* Repo Break Nights (Plain figure) */}
        <div className="bg-surface border border-border-subtle rounded-md p-3">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Repo Break Nights</span>
            <Tooltip content="Nights where cash buffer was exhausted and Tier 1 repo had to be redeemed early with 0.5% haircut." />
          </div>
          <span className="text-base sm:text-lg font-bold text-text-primary tabular-nums block font-mono">
            {stratKpi ? stratKpi.repo_break_nights : "—"}
          </span>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            {stratKpi ? `of ${stratKpi.nights} nights` : "—"}
          </span>
        </div>

        {/* Payout Success (Plain figure, NEVER green decoration) */}
        <div className="bg-surface border border-border-subtle rounded-md p-3">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Payout Success</span>
            <Tooltip content="Percentage of nights where all withdrawal requests were honored without operational default." />
          </div>
          <span className="text-base sm:text-lg font-bold text-text-primary tabular-nums block font-mono">
            {stratKpi ? formatPercent(stratKpi.payout_success_rate, 1) : "—"}
          </span>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            100% SLA target
          </span>
        </div>

        {/* Price of Safety (Derived metric with explicit definition tooltip) */}
        <div className="bg-surface border border-border-subtle rounded-md p-3">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Price of Safety</span>
            <Tooltip
              title="Price of Safety"
              content="The net yield sacrificed by maintaining a zero-overdraft policy (S4) compared to cost-optimal quantile balancing (S5)."
            />
          </div>
          <span className="text-base sm:text-lg font-bold text-text-primary tabular-nums block font-mono">
            {priceOfSafety !== null ? formatMillions(priceOfSafety, 2) : "—"}
          </span>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            {priceOfSafety !== null ? formatCurrency(priceOfSafety, 0) : "S5 – S4 delta"}
          </span>
        </div>
      </div>

      {/* Strategic Sleeve & Combined Performance Strip */}
      <div className="bg-surface border border-border-subtle rounded-md p-3 grid grid-cols-1 md:grid-cols-3 gap-3 divide-y md:divide-y-0 md:divide-x divide-border-subtle">
        {/* Strategic Sleeve P&L */}
        <div className="pt-2 md:pt-0 md:px-3 first:pt-0 first:px-0">
          <div className="flex items-center justify-between text-text-secondary mb-1">
            <span className="text-2xs font-semibold uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-accent-primary" aria-hidden="true" />
              Strategic sleeve P&L
            </span>
            <Tooltip content="Cumulative net profit or loss generated by the strategic sleeve ($50M separate capital pool invested in repo, bonds, and equities)." />
          </div>
          <div className="text-lg sm:text-xl font-bold tabular-nums tracking-tight">
            <SignedMoney value={sleevePnl} compact decimals={2} />
          </div>
          <div className="mt-0.5 text-2xs text-text-muted flex justify-between tabular-nums">
            <span>{sleevePnl !== null ? formatCurrency(sleevePnl, 2) : "—"}</span>
            <span className="text-text-secondary font-mono">
              {latestSleevePoint ? `Val: ${formatMillions(latestSleevePoint.total, 1)}` : "Separate pool"}
            </span>
          </div>
        </div>

        {/* Excess vs repo-only */}
        <div className="pt-2 md:pt-0 md:px-3">
          <div className="flex items-center justify-between text-text-secondary mb-1">
            <span className="text-2xs font-semibold uppercase tracking-wider">
              Excess vs repo-only
            </span>
            <Tooltip content="Net P&L of the strategic sleeve minus the benchmark return achieved by holding 100% in Tier 1 overnight repo." />
          </div>
          <div className="text-lg sm:text-xl font-bold tabular-nums tracking-tight">
            <SignedMoney value={sleeveExcess} compact decimals={2} />
          </div>
          <div className="mt-0.5 text-2xs text-text-muted flex justify-between tabular-nums">
            <span>{sleeveExcess !== null ? formatCurrency(sleeveExcess, 2) : "—"}</span>
            <span className="text-text-muted font-mono">
              {latestSleevePoint ? `Bench: ${formatMillions(latestSleevePoint.benchmark, 1)}` : "vs 100% repo"}
            </span>
          </div>
        </div>

        {/* Combined line: Operating pool (S4) + sleeve */}
        <div className="pt-2 md:pt-0 md:px-3 bg-accent-subtle/30 -m-3 p-3 rounded-r-md">
          <div className="flex items-center justify-between text-text-secondary mb-1">
            <span className="text-2xs font-bold uppercase tracking-wider text-accent-primary">
              Operating pool (S4) + sleeve
            </span>
            <Tooltip
              title="Combined Total Return"
              content="Clearly labelled as a simple sum of two separate capital pools: the nightly operating pool ($100M replenished) and the strategic sleeve ($50M separate capital)."
            />
          </div>
          <div className="text-lg sm:text-xl font-extrabold tabular-nums tracking-tight text-text-primary">
            <SignedMoney value={combinedPnl} compact decimals={2} />
          </div>
          <div className="mt-0.5 text-2xs text-text-muted flex justify-between tabular-nums font-mono">
            <span>{combinedPnl !== null ? formatCurrency(combinedPnl, 2) : "—"}</span>
            <span className="text-accent-primary font-sans font-medium text-[11px]">
              Simple sum of two separate capital pools
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KpiStrip;
