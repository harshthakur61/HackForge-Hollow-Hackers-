/**
 * ReserveGauge.tsx: Visual gauge representing the 17:00 buffer allocation against
 * the model's quantile forecasts (P50, P90, P95, P98, P99).
 * The actual required buffer appears only after the 08:00 settlement event with
 * a "Covered" or "Short" status badge.
 */

import React from "react";
import { CheckCircle2, AlertTriangle, Target, Gauge } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { formatMillions, formatCurrency } from "../utils/formatters";

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
      <div className="bg-surface border border-border-subtle rounded-md p-5 flex flex-col items-center justify-center text-center min-h-[160px]">
        <Gauge className="w-8 h-8 text-text-muted mb-2" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-text-primary">Overnight Reserve Allocation Gauge</h3>
        <p className="text-xs text-text-secondary mt-1 max-w-md">
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
    <div className="bg-surface border border-border-subtle rounded-md p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          <h3 className="text-sm font-bold text-text-primary">
            Reserve Buffer vs Quantile Forecasts ({decision.model})
          </h3>
          <span className="text-2xs font-mono text-text-muted bg-subtle px-1.5 py-0.5 rounded-xs border border-border-subtle">
            q* = {decision.quantile_used.toFixed(4)}
          </span>
        </div>

        {/* Settlement Covered / Short Badge (Appears only after settlement) */}
        {actualRequired !== null && (
          <div className="flex items-center gap-2">
            {isCovered ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs text-xs font-semibold bg-pos-bg border border-pos/30 text-pos">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                COVERED (Actual {formatMillions(actualRequired)})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs text-xs font-semibold bg-neg-bg border border-neg/30 text-neg">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                SHORT BY {formatMillions(actualRequired - bufferUsd)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Gauge Progress Bar */}
      <div className="space-y-2 pt-1">
        <div className="relative h-6 bg-subtle rounded-sm overflow-hidden border border-border-subtle">
          {/* Buffer Bar (Solid fill, no gradient) */}
          <div
            className="h-full bg-accent-primary transition-all duration-150 rounded-l-xs flex items-center justify-end pr-2"
            style={{ width: `${bufferPct}%` }}
          >
            <span className="text-2xs font-bold text-white font-mono tabular-nums">
              {formatMillions(bufferUsd)}
            </span>
          </div>

          {/* Actual Required Marker (After Settlement Only) */}
          {actualPct !== null && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-warn z-20 transition-all duration-150"
              style={{ left: `${actualPct}%` }}
              title={`Actual Required Buffer: ${formatCurrency(actualRequired)}`}
            >
              <div className="absolute -top-1 -translate-x-1/2 w-2.5 h-2.5 bg-warn rotate-45 rounded-xs" />
            </div>
          )}
        </div>

        {/* Quantile Tick Markers (P50, P90, P95, P98, P99) */}
        <div className="relative h-8 text-2xs font-mono text-text-muted">
          {sortedForecasts.map((fc) => {
            const leftPct = (fc.buffer_usd / maxScale) * 100;
            if (leftPct > 100) return null;
            return (
              <div
                key={fc.quantile}
                className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                style={{ left: `${leftPct}%` }}
              >
                <div className="w-px h-2 bg-border-strong mb-0.5" />
                <span className="font-semibold text-text-primary">
                  P{Math.round(fc.quantile * 100)}
                </span>
                <span className="text-[9px] text-text-muted tabular-nums">
                  {formatMillions(fc.buffer_usd, 1)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gauge Meta Footer */}
      <div className="pt-2 border-t border-border-subtle grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div>
          <span className="text-text-muted text-2xs block">Allocated Buffer</span>
          <span className="font-semibold text-text-primary font-mono tabular-nums">{formatCurrency(bufferUsd)}</span>
        </div>
        <div>
          <span className="text-text-muted text-2xs block">Swept to Repo</span>
          <span className="font-semibold text-text-primary font-mono tabular-nums">{formatCurrency(decision.sweep_usd)}</span>
        </div>
        <div>
          <span className="text-text-muted text-2xs block">Actual Trough</span>
          <span className="font-semibold text-text-primary font-mono tabular-nums">
            {actualRequired !== null ? formatCurrency(actualRequired) : "Pending 08:00 settlement"}
          </span>
        </div>
        <div>
          <span className="text-text-muted text-2xs block">Settlement Outcome</span>
          <span className="font-semibold font-mono tabular-nums">
            {actualRequired === null ? (
              <span className="text-text-muted">In Progress</span>
            ) : isCovered ? (
              <span className="text-pos">Buffer Protected (+${formatCurrency(bufferUsd - actualRequired, 0).replace("$", "")} margin)</span>
            ) : (
              <span className="text-neg">Overdraft Triggered</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ReserveGauge;
