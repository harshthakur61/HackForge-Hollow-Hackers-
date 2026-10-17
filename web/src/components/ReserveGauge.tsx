/**
 * ReserveGauge.tsx: Visual gauge representing the 17:00 buffer allocation against
 * the model's quantile forecasts (P50, P90, P95, P98, P99).
 * The actual required buffer appears only after the 08:00 settlement event with
 * a "Covered" or "Short" status badge.
 */

import React from "react";
import { CheckCircle2, AlertTriangle, Target, Gauge } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { formatMillions, formatCurrency, formatPercent } from "../utils/formatters";

export const ReserveGauge: React.FC = () => {
  const currentNight = useReplayStore((s) => s.currentNight);
  const settledHistory = useReplayStore((s) => s.settledHistory);

  const decisionEvent = currentNight.decision;
  const decision = decisionEvent?.decision;
  const forecasts = decisionEvent?.forecasts || [];
  const pool = decisionEvent?.pool || 100000000;

  // Check if current night has settled
  const settlement = settledHistory.find((h) => h.night_date === decisionEvent?.night_date);
  const actualRequired = settlement ? settlement.actual_required_usd : null;
  const isCovered = settlement ? settlement.covered : null;

  if (!decision) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col items-center justify-center text-center min-h-[160px]">
        <Gauge className="w-8 h-8 text-muted-foreground/50 mb-2" />
        <h3 className="text-sm font-semibold text-foreground">Overnight Reserve Allocation Gauge</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md">
          Awaiting 17:00 sweep decision to project buffer against model quantile forecasts (P50–P99).
        </p>
      </div>
    );
  }

  const bufferUsd = decision.buffer_usd;
  const maxScale = Math.max(
    pool * 0.5,
    ...forecasts.map((f) => f.buffer_usd),
    bufferUsd * 1.2,
    actualRequired ? actualRequired * 1.2 : 0
  );

  // Position percentage for gauge
  const bufferPct = Math.min(100, Math.max(0, (bufferUsd / maxScale) * 100));
  const actualPct = actualRequired !== null ? Math.min(100, Math.max(0, (actualRequired / maxScale) * 100)) : null;

  // Sort forecasts by quantile
  const sortedForecasts = [...forecasts].sort((a, b) => a.quantile - b.quantile);

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            Reserve Buffer vs Quantile Forecasts ({decision.model})
          </h3>
          <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
            q* = {decision.quantile_used.toFixed(4)}
          </span>
        </div>

        {/* Settlement Covered / Short Badge */}
        {actualRequired !== null && (
          <div className="flex items-center gap-2">
            {isCovered ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-success/15 border border-success/30 text-success">
                <CheckCircle2 className="w-3.5 h-3.5" />
                COVERED (Actual {formatMillions(actualRequired)})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-danger/15 border border-danger/30 text-danger animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                SHORT BY {formatMillions(actualRequired - bufferUsd)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Gauge Progress Bar */}
      <div className="space-y-2 pt-2">
        <div className="relative h-7 bg-muted/60 rounded-lg overflow-hidden border border-border">
          {/* Buffer Bar */}
          <div
            className="h-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-500 rounded-l-lg flex items-center justify-end pr-2"
            style={{ width: `${bufferPct}%` }}
          >
            <span className="text-[11px] font-bold text-primary-foreground font-mono drop-shadow-xs">
              {formatMillions(bufferUsd)}
            </span>
          </div>

          {/* Actual Required Marker (After Settlement Only) */}
          {actualPct !== null && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-amber-400 z-20 shadow-md transition-all duration-500"
              style={{ left: `${actualPct}%` }}
              title={`Actual Required Buffer: ${formatCurrency(actualRequired)}`}
            >
              <div className="absolute -top-1 -translate-x-1/2 w-3 h-3 bg-amber-400 rotate-45 rounded-xs" />
            </div>
          )}
        </div>

        {/* Quantile Tick Markers (P50, P90, P95, P98, P99) */}
        <div className="relative h-8 text-[10px] font-mono text-muted-foreground">
          {sortedForecasts.map((fc) => {
            const leftPct = (fc.buffer_usd / maxScale) * 100;
            if (leftPct > 100) return null;
            return (
              <div
                key={fc.quantile}
                className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                style={{ left: `${leftPct}%` }}
              >
                <div className="w-0.5 h-2 bg-border mb-0.5" />
                <span className="font-semibold text-foreground">
                  P{Math.round(fc.quantile * 100)}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {formatMillions(fc.buffer_usd, 1)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gauge Meta Footer */}
      <div className="pt-2 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground text-[10px] block">Allocated Buffer</span>
          <span className="font-bold text-foreground font-mono">{formatCurrency(bufferUsd)}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-[10px] block">Target Quantile</span>
          <span className="font-bold text-primary font-mono">{formatPercent(decision.quantile_used, 2, true)}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-[10px] block">Actual Required</span>
          <span className="font-bold text-foreground font-mono">{formatCurrency(actualRequired)}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-[10px] block">Coverage Margin</span>
          <span
            className={`font-bold font-mono ${
              actualRequired === null
                ? "text-muted-foreground"
                : isCovered
                ? "text-success"
                : "text-danger"
            }`}
          >
            {actualRequired === null
              ? "—"
              : formatCurrency(bufferUsd - actualRequired)}
          </span>
        </div>
      </div>
    </div>
  );
};
