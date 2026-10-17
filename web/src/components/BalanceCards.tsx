/**
 * BalanceCards.tsx: Real-time balance cards for Tier 0 Cash, Tier 1 Repo,
 * Emergency Overdraft, and the 17:00 Sweep allocation amount.
 */

import React from "react";
import { Wallet, TrendingUp, AlertOctagon, ArrowRightLeft } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { formatMillions, formatCurrency } from "../utils/formatters";

export const BalanceCards: React.FC = () => {
  const currentNight = useReplayStore((s) => s.currentNight);
  const hourlyTicks = currentNight.hourlyTicks;
  const latestTick = hourlyTicks.length > 0 ? hourlyTicks[hourlyTicks.length - 1] : null;
  const decision = currentNight.decision?.decision;

  const cash = latestTick?.balances.cash ?? (decision ? decision.buffer_usd : 100000000);
  const repo = latestTick?.balances.repo ?? (decision ? decision.sweep_usd : 0);
  const overdraft = latestTick?.balances.overdraft ?? 0;
  const sweepUsd = decision?.sweep_usd ?? null;
  const bufferUsd = decision?.buffer_usd ?? null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Tier 0: Cash Reserve */}
      <div
        id="cash-balance-card"
        className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden transition-all duration-300"
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider">Tier 0 Cash</span>
          <Wallet className="w-4 h-4 text-primary" />
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums tracking-tight">
          {formatMillions(cash, 1)}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground flex justify-between tabular-nums">
          <span>Actual: {formatCurrency(cash, 0)}</span>
          {bufferUsd !== null && (
            <span className="text-primary font-mono font-medium">Buf: {formatMillions(bufferUsd, 1)}</span>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/30" />
      </div>

      {/* Tier 1: Overnight Repo */}
      <div
        id="repo-balance-card"
        className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden transition-all duration-300"
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider">Tier 1 Repo</span>
          <TrendingUp className="w-4 h-4 text-accent" />
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums tracking-tight">
          {formatMillions(repo, 1)}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground flex justify-between tabular-nums">
          <span>Principal: {formatCurrency(repo, 0)}</span>
          {latestTick && (
            <span className="text-accent font-mono font-medium">{latestTick.repo_apy.toFixed(2)}% APY</span>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-accent/40" />
      </div>

      {/* 17:00 Sweep Allocation */}
      <div
        id="sweep-balance-card"
        className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden transition-all duration-300"
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider">17:00 Sweep</span>
          <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums tracking-tight">
          {formatMillions(sweepUsd, 1)}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground flex justify-between tabular-nums">
          <span>Swept: {formatCurrency(sweepUsd, 0)}</span>
          {decision && (
            <span className="text-indigo-400 font-mono font-medium">{decision.model}</span>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500/30" />
      </div>

      {/* Emergency Overdraft Facility */}
      <div
        id="overdraft-balance-card"
        className={`bg-card border rounded-xl p-4 shadow-sm relative overflow-hidden transition-all duration-300 ${
          overdraft > 0 ? "border-danger/60 bg-danger/5" : "border-border"
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider">Overdraft</span>
          <AlertOctagon
            className={`w-4 h-4 ${overdraft > 0 ? "text-danger animate-pulse" : "text-muted-foreground"}`}
          />
        </div>
        <div
          className={`text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight ${
            overdraft > 0 ? "text-danger" : "text-foreground"
          }`}
        >
          {formatMillions(overdraft, 1)}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground flex justify-between tabular-nums">
          <span>{overdraft > 0 ? "Active facility" : "Zero balance"}</span>
          <span className="font-mono text-muted-foreground">12.0% APR</span>
        </div>
        <div
          className={`absolute bottom-0 left-0 right-0 h-1 ${
            overdraft > 0 ? "bg-danger" : "bg-muted"
          }`}
        />
      </div>
    </div>
  );
};
