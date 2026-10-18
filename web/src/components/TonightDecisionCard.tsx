import React from "react";
import { ShieldCheck, Info } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { formatCurrency, formatMillions, translateModelCode } from "../utils/formatters";
import Tooltip from "./common/Tooltip";

export const TonightDecisionCard: React.FC = () => {
  const currentNight = useReplayStore((s) => s.currentNight);
  const decisionEvent = currentNight.decision;
  const decision = decisionEvent?.decision;

  if (!decision) {
    return (
      <div className="bg-surface border border-border-subtle rounded-md p-5 text-center">
        <ShieldCheck className="w-8 h-8 text-text-muted mx-auto mb-2" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-text-primary">Tonight's Sweep Decision</h4>
        <p className="text-xs text-text-secondary mt-1">
          Awaiting 17:00 policy execution for {currentNight.nightDate || "the upcoming night"}.
        </p>
      </div>
    );
  }

  const modelTranslated = translateModelCode(decision.model);

  return (
    <div className="bg-surface border border-border-subtle rounded-md p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wide">
            Tonight's Sweep Decision (17:00)
          </h4>
        </div>
        <span className="text-2xs font-mono font-medium px-1.5 py-0.5 rounded-xs bg-subtle text-text-secondary border border-border-subtle">
          {decisionEvent.night_date}
        </span>
      </div>

      {/* Allocation breakdown */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-sm bg-subtle/50 border border-border-subtle">
          <span className="text-2xs font-medium text-text-secondary uppercase block mb-0.5">
            Allocated Buffer
          </span>
          <span className="text-base font-bold text-text-primary tabular-nums block">
            {formatMillions(decision.buffer_usd, 1)}
          </span>
          <span className="text-2xs text-text-muted tabular-nums">
            {formatCurrency(decision.buffer_usd, 0)}
          </span>
        </div>

        <div className="p-2 rounded-sm bg-subtle/50 border border-border-subtle">
          <span className="text-2xs font-medium text-text-secondary uppercase block mb-0.5">
            Overnight Sweep
          </span>
          <span className="text-base font-bold text-text-primary tabular-nums block">
            {formatMillions(decision.sweep_usd, 1)}
          </span>
          <span className="text-2xs text-text-muted tabular-nums">
            {formatCurrency(decision.sweep_usd, 0)}
          </span>
        </div>
      </div>

      {/* Parameters & Model */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary flex items-center gap-1">
            Forecasting Model:
            <Tooltip content="Statistical/ML model generating walk-forward quantile forecasts from historical liquidity distributions." />
          </span>
          <span className="font-mono font-medium text-text-primary" title={modelTranslated}>
            {decision.model} ({modelTranslated.split(" ")[0]})
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Quantile Used:</span>
          <span className="font-mono font-bold text-accent-primary tabular-nums">
            q* = {decision.quantile_used.toFixed(4)}
          </span>
        </div>

        <div className="flex items-center justify-between text-2xs text-text-muted">
          <span>Target Thresholds:</span>
          <span className="font-mono tabular-nums">
            q*(zero)={decision.q_star_zero.toFixed(3)} | q*(opt)={decision.q_star_opt.toFixed(3)}
          </span>
        </div>
      </div>

      {/* Reason text */}
      <div className="p-2.5 rounded-sm bg-subtle/40 border border-border-subtle text-xs">
        <div className="flex items-center gap-1 text-2xs font-medium text-text-secondary mb-1">
          <Info className="w-3 h-3 text-text-muted" aria-hidden="true" />
          <span>Decision Rationale</span>
        </div>
        <p className="text-2xs text-text-primary leading-relaxed font-mono whitespace-pre-wrap">
          {decision.reason}
        </p>
      </div>
    </div>
  );
};

export default TonightDecisionCard;
