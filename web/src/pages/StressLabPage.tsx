/**
 * StressLabPage.tsx: Dedicated Stress Testing Laboratory page.
 * Keeps every function, control, parameter slider, single-night deep dive, and multi-strategy batch test,
 * restyled to match the institutional fintech design system.
 */

import React from "react";
import { Sliders } from "lucide-react";
import { StressControls } from "../components/stress/StressControls";
import { StressNightImpact } from "../components/stress/StressNightImpact";
import { StressBatchTable } from "../components/stress/StressBatchTable";

export const StressLabPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border-subtle">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-accent-primary" aria-hidden="true" />
            <h2 className="text-xl font-bold tracking-tight text-text-primary">
              Synthetic Stress Lab
            </h2>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Counterfactual shock testing applied strictly after 17:00 decision execution (surprise shock).
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-subtle border border-border-subtle text-xs text-text-secondary font-mono">
          <span>Non-destructive sandbox</span>
        </div>
      </div>

      {/* Scenario Controls & Parameter Sliders */}
      <StressControls />

      {/* Single Night Impact & Progression Trace */}
      <StressNightImpact />

      {/* Multi-Strategy Batch Test Comparison Table & Bar Chart */}
      <StressBatchTable />
    </div>
  );
};

export default StressLabPage;
