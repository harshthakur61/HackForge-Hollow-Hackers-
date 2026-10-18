/**
 * StressLabView.tsx: Root container component for the Stress Lab view.
 * Renders independent of replay: scenario configuration controls,
 * single-night deep dive impact cards & charts, and multi-strategy batch comparison table.
 */

import React from "react";
import { StressControls } from "./StressControls";
import { StressNightImpact } from "./StressNightImpact";
import { StressBatchTable } from "./StressBatchTable";

export const StressLabView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Scenario Controls & Parameter Sliders */}
      <StressControls />

      {/* Single Night Impact & Progression Trace */}
      <StressNightImpact />

      {/* Multi-Strategy Batch Test Comparison Table & Bar Chart */}
      <StressBatchTable />
    </div>
  );
};
