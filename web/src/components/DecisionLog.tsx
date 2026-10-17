/**
 * DecisionLog.tsx: Live decision audit log table with row click slide-over panel.
 * Lists time, strategy, model, quantile, buffer, sweep, reason snippet, and net P&L.
 */

import React, { useState } from "react";
import { Table, X, ExternalLink, HelpCircle } from "lucide-react";
import { useDecisionsQuery } from "../hooks/useQueries";
import { DecisionLogRow } from "../contract";
import { formatCurrency, formatMillions, formatPercent } from "../utils/formatters";

export const DecisionLog: React.FC = () => {
  const { data: decisionsData, isLoading } = useDecisionsQuery(50);
  const [selectedRow, setSelectedRow] = useState<DecisionLogRow | null>(null);

  const decisions = decisionsData?.decisions || [];

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-3 relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Decision Audit Log</h3>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          Showing latest {decisions.length} decisions (click row for full breakdown)
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2 py-4 animate-pulse">
          <div className="h-8 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
        </div>
      ) : decisions.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          No decision records available yet.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[380px] border border-border rounded-lg">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="bg-muted/70 text-muted-foreground uppercase text-[10px] font-semibold sticky top-0 backdrop-blur-xs z-10 border-b border-border">
              <tr>
                <th className="py-2.5 px-3">Night</th>
                <th className="py-2.5 px-3">Strategy</th>
                <th className="py-2.5 px-3">Model</th>
                <th className="py-2.5 px-3">Quantile</th>
                <th className="py-2.5 px-3">Buffer</th>
                <th className="py-2.5 px-3">Sweep</th>
                <th className="py-2.5 px-3">Net P&L</th>
                <th className="py-2.5 px-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {decisions.map((row) => (
                <tr
                  key={`${row.night_date}-${row.strategy}`}
                  onClick={() => setSelectedRow(row)}
                  className="hover:bg-muted/50 cursor-pointer transition-colors group"
                >
                  <td className="py-2 px-3 font-mono font-medium text-foreground whitespace-nowrap">
                    {row.night_date}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted border border-border">
                      {row.strategy.split("_")[0]}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono font-semibold text-primary">
                    {row.model}
                  </td>
                  <td className="py-2 px-3 font-mono">
                    {formatPercent(row.quantile_used, 2, true)}
                  </td>
                  <td className="py-2 px-3 font-mono font-medium text-foreground">
                    {formatMillions(row.buffer_usd)}
                  </td>
                  <td className="py-2 px-3 font-mono text-muted-foreground">
                    {formatMillions(row.sweep_usd)}
                  </td>
                  <td
                    className={`py-2 px-3 font-mono font-bold ${
                      row.net_pnl >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {formatCurrency(row.net_pnl)}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground max-w-[220px] truncate font-mono text-[11px]">
                    {row.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Side Slide-Over Panel for Selected Decision */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity">
          <div className="w-full max-w-md bg-card border-l border-border h-full shadow-2xl p-6 overflow-y-auto flex flex-col justify-between animate-in slide-in-from-right duration-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-bold text-foreground">
                    Decision Details: {selectedRow.night_date}
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedRow(null)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Numbers Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase">Strategy</span>
                  <span className="font-bold text-foreground">{selectedRow.strategy}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase">Model Used</span>
                  <span className="font-bold text-primary font-mono">{selectedRow.model}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase">Quantile Used</span>
                  <span className="font-bold text-foreground font-mono">
                    {formatPercent(selectedRow.quantile_used, 4, true)}
                  </span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase">Repo APY</span>
                  <span className="font-bold text-accent font-mono">{selectedRow.repo_apy.toFixed(4)}%</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase">Allocated Buffer</span>
                  <span className="font-bold text-foreground font-mono">{formatCurrency(selectedRow.buffer_usd)}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase">Swept Principal</span>
                  <span className="font-bold text-foreground font-mono">{formatCurrency(selectedRow.sweep_usd)}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase">Interest Earned</span>
                  <span className="font-bold text-foreground font-mono">{formatCurrency(selectedRow.interest)}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase">Break Fees</span>
                  <span className="font-bold text-amber-500 font-mono">{formatCurrency(selectedRow.break_fee)}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase">Overdraft Cost</span>
                  <span className="font-bold text-danger font-mono">{formatCurrency(selectedRow.overdraft_cost)}</span>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase">Net Overnight P&L</span>
                  <span className="font-bold text-success font-mono">{formatCurrency(selectedRow.net_pnl)}</span>
                </div>
              </div>

              {/* Full Reason Text */}
              <div className="space-y-1.5 pt-2">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /> Decision Rationale:
                </span>
                <div className="p-3 bg-muted/60 rounded-lg text-xs font-mono text-muted-foreground border border-border leading-relaxed break-words">
                  {selectedRow.reason}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedRow(null)}
              className="mt-6 w-full py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold rounded-lg border border-border transition-colors"
            >
              Close Panel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
