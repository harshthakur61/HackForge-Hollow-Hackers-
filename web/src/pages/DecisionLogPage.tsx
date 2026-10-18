/**
 * DecisionLogPage.tsx: Full decision audit log view.
 * Features:
 * - Strategy filtering (All, S0 - S6)
 * - Cursor pagination through /api/decisions (using 'before' parameter)
 * - Sorting across monetary and parameter columns
 * - Row detail drawer on click with full decision parameters & accounting
 * - CSV export of the rows currently loaded
 */

import React, { useState } from "react";
import {
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import { useDecisionsQuery } from "../hooks/useQueries";
import { DecisionLogRow } from "../contract";
import {
  formatCurrency,
  formatMillions,
  formatPercent,
  translateModelCode,
} from "../utils/formatters";
import {
  STRATEGY_LABELS,
  getStrategyLabel,
} from "../utils/labels";
import Drawer from "../components/common/Drawer";
import SignedMoney from "../components/common/SignedMoney";

const STRATEGY_FILTERS = [
  { value: "", label: "All Strategies" },
  { value: "S4_policy_zero_overdraft", label: STRATEGY_LABELS.S4_policy_zero_overdraft },
  { value: "S5_policy_cost_optimal", label: STRATEGY_LABELS.S5_policy_cost_optimal },
  { value: "S3_static", label: STRATEGY_LABELS.S3_static },
  { value: "S2_fixed_20", label: STRATEGY_LABELS.S2_fixed_20 },
  { value: "S1_fixed_10", label: STRATEGY_LABELS.S1_fixed_10 },
  { value: "S0_all_cash", label: STRATEGY_LABELS.S0_all_cash },
  { value: "S6_oracle", label: STRATEGY_LABELS.S6_oracle },
];

export const DecisionLogPage: React.FC = () => {
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);
  const [selectedRow, setSelectedRow] = useState<DecisionLogRow | null>(null);

  const limit = 50;
  const { data: decisionsData, isLoading, isFetching } = useDecisionsQuery(
    limit,
    selectedStrategy || undefined,
    currentCursor
  );

  const decisions = decisionsData?.decisions || [];

  // Pagination navigation
  const handleNextPage = () => {
    if (decisions.length === 0) return;
    const lastRow = decisions[decisions.length - 1];
    setCursorHistory((prev) => [...prev, currentCursor || ""]);
    setCurrentCursor(lastRow.night_date);
  };

  const handlePrevPage = () => {
    if (cursorHistory.length === 0) return;
    const previous = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((prev) => prev.slice(0, -1));
    setCurrentCursor(previous === "" ? undefined : previous);
  };

  // CSV Export
  const handleExportCsv = () => {
    if (decisions.length === 0) return;

    const headers = [
      "night_date",
      "strategy",
      "model",
      "quantile_used",
      "buffer_usd",
      "sweep_usd",
      "repo_apy",
      "interest",
      "break_fee",
      "overdraft_cost",
      "net_pnl",
      "reason",
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = decisions.map((d) =>
      [
        d.night_date,
        d.strategy,
        d.model,
        d.quantile_used,
        d.buffer_usd,
        d.sweep_usd,
        d.repo_apy,
        d.interest,
        d.break_fee,
        d.overdraft_cost,
        d.net_pnl,
        escapeCsv(d.reason),
      ].join(",")
    );

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `decisions_${selectedStrategy || "all"}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Actions Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-border-subtle">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text-primary">
            Decision Audit Trail
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Immutable log of nightly buffer allocations, quantile parameters, and financial accounting.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Strategy Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
            <select
              id="filter-strategy"
              aria-label="Filter decisions by strategy"
              value={selectedStrategy}
              onChange={(e) => {
                setSelectedStrategy(e.target.value);
                setCurrentCursor(undefined);
                setCursorHistory([]);
              }}
              className="px-2.5 py-1.5 text-xs rounded-sm border border-border-subtle bg-surface text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              {STRATEGY_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* CSV Export Button */}
          <button
            type="button"
            id="export-csv-button"
            onClick={handleExportCsv}
            disabled={decisions.length === 0}
            aria-label="Export currently loaded decisions as CSV"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border border-border-subtle bg-surface hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Decisions Table */}
      <div className="bg-surface border border-border-subtle rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between bg-surface/50">
          <span className="text-xs font-semibold text-text-primary">
            Loaded Records ({decisions.length} rows)
          </span>
          {isFetching && (
            <span className="text-2xs text-text-muted animate-pulse">
              Syncing with backend...
            </span>
          )}
        </div>

        <div className="overflow-x-auto focus:outline-none" tabIndex={0}>
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-subtle text-text-secondary uppercase text-2xs tracking-wider sticky top-0 border-b border-border-subtle">
              <tr>
                <th scope="col" className="py-2.5 px-3.5 font-semibold whitespace-nowrap">
                  Night Date
                </th>
                <th scope="col" className="py-2.5 px-3.5 font-semibold whitespace-nowrap">
                  Strategy
                </th>
                <th scope="col" className="py-2.5 px-3.5 font-semibold whitespace-nowrap">
                  Model
                </th>
                <th scope="col" className="py-2.5 px-3.5 text-right font-semibold whitespace-nowrap">
                  Quantile (q*)
                </th>
                <th scope="col" className="py-2.5 px-3.5 text-right font-semibold whitespace-nowrap">
                  Buffer Reserve
                </th>
                <th scope="col" className="py-2.5 px-3.5 text-right font-semibold whitespace-nowrap">
                  Swept to Repo
                </th>
                <th scope="col" className="py-2.5 px-3.5 text-right font-semibold whitespace-nowrap">
                  Repo APY
                </th>
                <th scope="col" className="py-2.5 px-3.5 text-right font-semibold whitespace-nowrap">
                  Net P&L
                </th>
                <th scope="col" className="py-2.5 px-3.5 font-semibold whitespace-nowrap">
                  Audit Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle tabular-nums font-mono text-2xs">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="py-3 px-3.5">
                      <div className="h-5 bg-subtle rounded-xs animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : decisions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-text-secondary font-sans text-xs">
                    No decisions found matching the selected strategy or date range.
                  </td>
                </tr>
              ) : (
                decisions.map((row) => (
                  <tr
                    key={`${row.night_date}-${row.strategy}`}
                    onClick={() => setSelectedRow(row)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedRow(row);
                      }
                    }}
                    className="hover:bg-subtle/60 cursor-pointer transition-colors focus:bg-subtle focus:outline-none"
                  >
                    <td className="py-2.5 px-3.5 font-bold text-text-primary whitespace-nowrap">
                      {row.night_date}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-sans text-xs">
                      <span className="px-1.5 py-0.5 rounded-xs bg-subtle border border-border-subtle font-mono text-2xs">
                        {row.strategy.split("_")[0]}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold text-accent-primary">
                      {row.model}
                    </td>
                    <td className="py-2.5 px-3.5 text-right text-text-secondary">
                      {row.quantile_used.toFixed(4)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right text-text-primary">
                      {formatCurrency(row.buffer_usd, 0)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right text-text-primary">
                      {formatCurrency(row.sweep_usd, 0)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right text-pos font-semibold">
                      {formatPercent(row.repo_apy, 2)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-bold text-xs">
                      <SignedMoney value={row.net_pnl} decimals={2} />
                    </td>
                    <td className="py-2.5 px-3.5 text-text-secondary max-w-xs truncate font-sans text-xs">
                      {row.reason}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Cursor Pagination Controls */}
        <div className="px-5 py-3 border-t border-border-subtle bg-subtle/30 flex items-center justify-between text-xs">
          <span className="text-text-muted">
            Page {cursorHistory.length + 1}
            {currentCursor && ` (filtered before ${currentCursor})`}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0}
              aria-label="Previous page of decisions"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm border border-border-subtle bg-surface hover:bg-subtle text-text-secondary disabled:opacity-40 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={decisions.length < limit}
              aria-label="Next page of decisions"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm border border-border-subtle bg-surface hover:bg-subtle text-text-secondary disabled:opacity-40 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Row Detail Inspection Drawer */}
      <Drawer
        isOpen={selectedRow !== null}
        onClose={() => setSelectedRow(null)}
        title={selectedRow ? `Audit: ${selectedRow.night_date}` : "Decision Audit"}
        subtitle={selectedRow ? getStrategyLabel(selectedRow.strategy) : undefined}
        width="md"
      >
        {selectedRow && (
          <div className="space-y-5 text-xs">
            {/* Allocation Overview */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-sm bg-subtle/50 border border-border-subtle">
                <span className="text-2xs uppercase font-semibold text-text-secondary block mb-1">
                  Buffer Allocation
                </span>
                <span className="text-lg font-bold text-text-primary tabular-nums block font-mono">
                  {formatCurrency(selectedRow.buffer_usd, 2)}
                </span>
                <span className="text-2xs text-text-muted">
                  {formatMillions(selectedRow.buffer_usd, 2)}
                </span>
              </div>

              <div className="p-3 rounded-sm bg-subtle/50 border border-border-subtle">
                <span className="text-2xs uppercase font-semibold text-text-secondary block mb-1">
                  Swept to Repo
                </span>
                <span className="text-lg font-bold text-text-primary tabular-nums block font-mono">
                  {formatCurrency(selectedRow.sweep_usd, 2)}
                </span>
                <span className="text-2xs text-text-muted">
                  {formatMillions(selectedRow.sweep_usd, 2)}
                </span>
              </div>
            </div>

            {/* Model & Parameters */}
            <div className="bg-surface border border-border-subtle rounded-sm p-3.5 space-y-2">
              <div className="text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
                Model & Execution Parameters
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-secondary">Model Code:</span>
                <span className="font-mono font-semibold text-text-primary">
                  {selectedRow.model}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-secondary">Model Description:</span>
                <span className="text-text-primary text-right">
                  {translateModelCode(selectedRow.model)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-secondary">Quantile Calibrated (q*):</span>
                <span className="font-mono font-bold text-accent-primary tabular-nums">
                  {selectedRow.quantile_used.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-secondary">Overnight Repo Yield:</span>
                <span className="font-mono font-bold text-pos tabular-nums">
                  {formatPercent(selectedRow.repo_apy, 2)} APY
                </span>
              </div>
            </div>

            {/* Settlement Accounting Breakdown */}
            <div className="bg-surface border border-border-subtle rounded-sm p-3.5 space-y-2">
              <div className="text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
                Settlement Accounting Breakdown
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-secondary">Gross Repo Interest:</span>
                <span className="font-mono font-semibold text-pos tabular-nums">
                  +{formatCurrency(selectedRow.interest, 2)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-secondary">Early Redemption Break Fee:</span>
                <span className="font-mono text-neg tabular-nums">
                  {selectedRow.break_fee > 0 ? `-${formatCurrency(selectedRow.break_fee, 2)}` : "$0.00"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-secondary">Emergency Overdraft Cost:</span>
                <span className="font-mono text-neg tabular-nums">
                  {selectedRow.overdraft_cost > 0
                    ? `-${formatCurrency(selectedRow.overdraft_cost, 2)}`
                    : "$0.00"}
                </span>
              </div>
              <div className="flex justify-between py-1.5 font-bold text-sm">
                <span className="text-text-primary">Net Night P&L:</span>
                <SignedMoney value={selectedRow.net_pnl} decimals={2} />
              </div>
            </div>

            {/* Full Decision Reason */}
            <div className="p-3 rounded-sm bg-subtle/50 border border-border-subtle space-y-1.5">
              <div className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary">
                <Info className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
                <span>Decision Audit Log Rationale</span>
              </div>
              <p className="font-mono text-2xs text-text-primary leading-relaxed whitespace-pre-wrap">
                {selectedRow.reason}
              </p>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default DecisionLogPage;
