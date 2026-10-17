/**
 * EventFeed.tsx: Real-time scrolling feed of operational events (repo_break, overdraft, alert).
 * Displays timestamps, event types, amounts, fees, and descriptive messages (max 200 items).
 */

import React from "react";
import { AlertCircle, AlertOctagon, Bell, ShieldAlert } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { formatCurrency, formatMillions } from "../utils/formatters";

export const EventFeed: React.FC = () => {
  const eventFeed = useReplayStore((s) => s.eventFeed);

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-warning" />
          <h3 className="text-sm font-bold text-foreground">Operational Event Feed</h3>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          {eventFeed.length} Events (max 200)
        </span>
      </div>

      {eventFeed.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
          No liquidity stress events recorded. Repo early redemptions and emergency overdrafts will appear here live.
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {eventFeed.map((ev, idx) => {
            const isBreak = ev.type === "repo_break";
            const isOverdraft = ev.type === "overdraft";

            return (
              <div
                key={`${ev.ts}-${idx}`}
                className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 transition-all ${
                  isBreak
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                    : isOverdraft
                    ? "bg-danger/10 border-danger/30 text-danger"
                    : "bg-sky-500/10 border-sky-500/30 text-sky-400"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isBreak ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : isOverdraft ? (
                    <AlertOctagon className="w-4 h-4" />
                  ) : (
                    <Bell className="w-4 h-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                    <span className="font-bold uppercase tracking-wide">
                      {isBreak ? "Repo Early Redemption" : isOverdraft ? "Emergency Overdraft" : "System Alert"}
                    </span>
                    <span className="text-muted-foreground">{ev.ts.replace("T", " ")}</span>
                  </div>
                  <p className="mt-0.5 text-foreground text-[11px] leading-tight">
                    {ev.message}
                  </p>
                  {(ev.amount > 0 || ev.fee > 0) && (
                    <div className="mt-1 flex items-center gap-3 text-[10px] font-mono text-muted-foreground tabular-nums">
                      {ev.amount > 0 && <span>Amount: {formatMillions(ev.amount)}</span>}
                      {ev.fee > 0 && <span>Fee: {formatCurrency(ev.fee)}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
