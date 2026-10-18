import React from "react";
import { Wallet, TrendingUp, AlertOctagon, Landmark, LineChart } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { formatMillions, formatCurrency, formatPercent } from "../utils/formatters";
import Tooltip from "./common/Tooltip";

export const CompactBalances: React.FC = () => {
  const currentNight = useReplayStore((s) => s.currentNight);
  const latestSleevePoint = useReplayStore((s) => s.latestSleevePoint);
  const hourlyTicks = currentNight.hourlyTicks;
  const latestTick = hourlyTicks.length > 0 ? hourlyTicks[hourlyTicks.length - 1] : null;
  const decision = currentNight.decision?.decision;

  const cash = latestTick?.balances.cash ?? (decision ? decision.buffer_usd : 100000000);
  const repo = latestTick?.balances.repo ?? (decision ? decision.sweep_usd : 0);
  const overdraft = latestTick?.balances.overdraft ?? 0;
  const bufferUsd = decision?.buffer_usd ?? null;
  const repoApy = latestTick?.repo_apy ?? (decision ? 5.25 : null);

  const sleeveBonds = latestSleevePoint?.bonds ?? latestTick?.sleeve?.bonds;
  const sleeveEquities = latestSleevePoint?.equities ?? latestTick?.sleeve?.equities;

  return (
    <div
      id="compact-balances-bar"
      className="bg-surface border border-border-subtle rounded-md p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle"
    >
      {/* Tier 0 Cash */}
      <div className="pt-2 sm:pt-0 lg:px-3 first:pt-0 first:px-0">
        <div className="flex items-center justify-between text-text-secondary mb-1">
          <span className="text-2xs font-semibold uppercase tracking-wider flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5 text-accent-primary" aria-hidden="true" />
            Tier 0 Cash
          </span>
          <Tooltip content="Immediate demand liquidity held in cash buffer to honor overnight client withdrawal spikes." />
        </div>
        <div className="text-lg sm:text-xl font-bold text-text-primary tabular-nums tracking-tight">
          {formatMillions(cash, 1)}
        </div>
        <div className="mt-0.5 text-2xs text-text-muted flex justify-between tabular-nums">
          <span>{formatCurrency(cash, 0)}</span>
          {bufferUsd !== null && (
            <span className="text-accent-primary font-mono font-medium">
              Buf: {formatMillions(bufferUsd, 1)}
            </span>
          )}
        </div>
      </div>

      {/* Tier 1 Repo (Operating) */}
      <div className="pt-2 sm:pt-0 lg:px-3">
        <div className="flex items-center justify-between text-text-secondary mb-1">
          <span className="text-2xs font-semibold uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-pos" aria-hidden="true" />
            Repo (operating)
          </span>
          <Tooltip content="Collateralized overnight repurchase agreement earning market yield until 08:00 maturity." />
        </div>
        <div className="text-lg sm:text-xl font-bold text-text-primary tabular-nums tracking-tight">
          {formatMillions(repo, 1)}
        </div>
        <div className="mt-0.5 text-2xs text-text-muted flex justify-between tabular-nums">
          <span>{formatCurrency(repo, 0)}</span>
          {repoApy !== null ? (
            <span className="text-pos font-mono font-medium">
              {formatPercent(repoApy, 2)} APY
            </span>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </div>
      </div>

      {/* Tier 2 Bonds (Strategic Sleeve) */}
      <div className="pt-2 sm:pt-0 lg:px-3">
        <div className="flex items-center justify-between text-text-secondary mb-1">
          <span className="text-2xs font-semibold uppercase tracking-wider flex items-center gap-1">
            <Landmark className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            Bonds (strategic sleeve)
          </span>
          <Tooltip content="Tier 2: 2Y Government Bonds held in the strategic sleeve outside the nightly operating pool." />
        </div>
        <div className="text-lg sm:text-xl font-bold text-text-primary tabular-nums tracking-tight">
          {sleeveBonds !== undefined ? formatMillions(sleeveBonds, 1) : "—"}
        </div>
        <div className="mt-0.5 text-2xs text-text-muted flex justify-between tabular-nums">
          <span>{sleeveBonds !== undefined ? formatCurrency(sleeveBonds, 0) : "—"}</span>
          <span className="text-text-muted font-mono" title="Tick contract lacks instantaneous bond yield; renders dash">
            Yield: —
          </span>
        </div>
      </div>

      {/* Tier 3 Equities (Strategic Sleeve) */}
      <div className="pt-2 sm:pt-0 lg:px-3">
        <div className="flex items-center justify-between text-text-secondary mb-1">
          <span className="text-2xs font-semibold uppercase tracking-wider flex items-center gap-1">
            <LineChart className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
            Equities (strategic sleeve)
          </span>
          <Tooltip content="Tier 3: Equity Index allocation held in strategic sleeve for long-term equity risk premium." />
        </div>
        <div className="text-lg sm:text-xl font-bold text-text-primary tabular-nums tracking-tight">
          {sleeveEquities !== undefined ? formatMillions(sleeveEquities, 1) : "—"}
        </div>
        <div className="mt-0.5 text-2xs text-text-muted flex justify-between tabular-nums">
          <span>{sleeveEquities !== undefined ? formatCurrency(sleeveEquities, 0) : "—"}</span>
          <span className="text-text-muted font-mono" title="Tick contract lacks instantaneous equity price; renders dash">
            Price: —
          </span>
        </div>
      </div>

      {/* Emergency Overdraft Facility */}
      <div className="pt-2 sm:pt-0 lg:px-3">
        <div className="flex items-center justify-between text-text-secondary mb-1">
          <span className="text-2xs font-semibold uppercase tracking-wider flex items-center gap-1">
            <AlertOctagon
              className={`w-3.5 h-3.5 ${overdraft > 0 ? "text-neg" : "text-text-muted"}`}
              aria-hidden="true"
            />
            Overdraft
          </span>
          <Tooltip content="Penalty credit line utilized if cumulative withdrawals exceed both buffer and broken repo." />
        </div>
        <div
          className={`text-lg sm:text-xl font-bold tabular-nums tracking-tight ${
            overdraft > 0 ? "text-neg" : "text-text-primary"
          }`}
        >
          {formatMillions(overdraft, 1)}
        </div>
        <div className="mt-0.5 text-2xs text-text-muted flex justify-between tabular-nums">
          <span>{formatCurrency(overdraft, 0)}</span>
          <span className={overdraft > 0 ? "text-neg font-semibold" : "text-text-muted"}>
            {overdraft > 0 ? "Active Draw" : "12.0% APR if drawn"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CompactBalances;
