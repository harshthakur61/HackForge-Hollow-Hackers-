/**
 * LiveTreasuryPage.tsx: Institutional Live Treasury workstation page.
 * Hierarchy:
 * 1. Compact replay toolbar + Scenario settings drawer
 * 2. Primary liquidity area (NightChart) + Right rail (TonightDecisionCard, ReserveGauge)
 * 3. Compact balances strip (Cash, Repo, Overdraft, 17:00 Sweep)
 * 4. Cumulative performance KPI strip (Net P&L visually primary; Price of Safety)
 * 5. Side-by-side Strategy race & Forecast vs Actual charts
 * 6. Decision log preview & Operational event feed
 */

import React from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileText } from "lucide-react";
import Controls from "../components/Controls";
import CompactBalances from "../components/CompactBalances";
import NightChart from "../components/NightChart";
import SleeveChart from "../components/SleeveChart";
import TonightDecisionCard from "../components/TonightDecisionCard";
import ReserveGauge from "../components/ReserveGauge";
import KpiStrip from "../components/KpiStrip";
import StrategyRace from "../components/StrategyRace";
import ForecastVsActual from "../components/ForecastVsActual";
import EventFeed from "../components/EventFeed";
import { useDecisionsQuery } from "../hooks/useQueries";
import { formatCurrency, formatMillions } from "../utils/formatters";

export const LiveTreasuryPage: React.FC = () => {
  const { data: decisionsData, isLoading: decisionsLoading } = useDecisionsQuery(5);
  const recentDecisions = decisionsData?.decisions || [];

  return (
    <div className="space-y-5">
      {/* 1. Compact Replay Toolbar & Scenario Settings Drawer */}
      <Controls />

      {/* 2. Primary Liquidity Area (~2/3) & Right Rail (~1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <NightChart />
          <div id="strategic-sleeve-section">
            <SleeveChart />
          </div>
        </div>
        <div className="lg:col-span-1 space-y-4">
          <TonightDecisionCard />
          <ReserveGauge />
        </div>
      </div>

      {/* 3. Balances as one compact summary */}
      <CompactBalances />

      {/* 4. Cumulative Performance KPI Strip */}
      <KpiStrip />

      {/* 5. Strategy Race & Forecast vs Actual calibration charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <StrategyRace />
        <ForecastVsActual />
      </div>

      {/* 6. Decision Log Preview & Operational Event Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Decision Log Preview */}
        <div className="lg:col-span-2 bg-surface border border-border-subtle rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent-primary" aria-hidden="true" />
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">
                Recent Decisions Audit
              </h3>
            </div>
            <Link
              to="/decisions"
              className="inline-flex items-center gap-1 text-xs text-accent-primary hover:text-accent-hover font-medium underline"
            >
              <span>View full audit log</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          {decisionsLoading ? (
            <div className="space-y-2 py-4">
              <div className="h-6 bg-subtle rounded-xs animate-pulse" />
              <div className="h-6 bg-subtle rounded-xs animate-pulse" />
              <div className="h-6 bg-subtle rounded-xs animate-pulse" />
            </div>
          ) : recentDecisions.length === 0 ? (
            <div className="text-center py-6 text-xs text-text-secondary border border-dashed border-border-subtle rounded-sm">
              No historical decisions recorded yet. Decisions will log here at each 17:00 cycle.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums border-collapse">
                <thead className="bg-subtle text-text-secondary uppercase text-2xs sticky top-0 border-b border-border-subtle">
                  <tr>
                    <th className="py-2 px-3">Night</th>
                    <th className="py-2 px-3">Strategy</th>
                    <th className="py-2 px-3 text-right">Buffer</th>
                    <th className="py-2 px-3 text-right">Sweep</th>
                    <th className="py-2 px-3 text-right">Net P&L</th>
                    <th className="py-2 px-3">Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle font-mono text-2xs">
                  {recentDecisions.map((row) => (
                    <tr key={`${row.night_date}-${row.strategy}`} className="hover:bg-subtle/50">
                      <td className="py-2 px-3 font-semibold text-text-primary whitespace-nowrap">
                        {row.night_date}
                      </td>
                      <td className="py-2 px-3 text-text-secondary whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded-xs bg-subtle border border-border-subtle">
                          {row.strategy.split("_")[0]}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">{formatMillions(row.buffer_usd, 1)}</td>
                      <td className="py-2 px-3 text-right">{formatMillions(row.sweep_usd, 1)}</td>
                      <td
                        className={`py-2 px-3 text-right font-bold ${
                          row.net_pnl > 0 ? "text-pos" : row.net_pnl < 0 ? "text-neg" : "text-text-primary"
                        }`}
                      >
                        {formatCurrency(row.net_pnl, 0)}
                      </td>
                      <td className="py-2 px-3 text-text-muted truncate max-w-xs font-sans text-xs">
                        {row.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Operational Event Feed */}
        <div className="lg:col-span-1">
          <EventFeed />
        </div>
      </div>
    </div>
  );
};

export default LiveTreasuryPage;
