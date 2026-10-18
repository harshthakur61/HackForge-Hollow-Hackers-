/**
 * EventFeed.tsx: Real-time scrolling feed of operational events (repo_break, overdraft, alert).
 * Displays timestamps, event types, amounts, fees, and descriptive messages (max 200 items).
 * Adheres strictly to institutional fintech design: calm, dense, no pulsing animations.
 */

import React from "react";
import { AlertCircle, AlertOctagon, Bell, ShieldAlert } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { formatCurrency, formatMillions } from "../utils/formatters";

export const EventFeed: React.FC = () => {
  const eventFeed = useReplayStore((s) => s.eventFeed);

  return (
    <div className="bg-surface border border-border-subtle rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-warn" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">
            Operational Event Feed
          </h3>
        </div>
        <span className="text-2xs text-text-muted font-mono">
          {eventFeed.length} Events (max 200)
        </span>
      </div>

      {eventFeed.length === 0 ? (
        <div className="text-center py-8 text-xs text-text-secondary border border-dashed border-border-subtle rounded-sm bg-subtle/30">
          No liquidity stress events recorded. Repo early redemptions and emergency overdrafts will appear here live as simulation progresses.
        </div>
      ) : (
        <div
          role="log"
          aria-live="polite"
          aria-label="Real-time operational events log"
          className="space-y-2 max-h-[340px] overflow-y-auto pr-1"
        >
          {eventFeed.map((ev, idx) => {
            const isBreak = ev.type === "repo_break";
            const isOverdraft = ev.type === "overdraft";

            return (
              <div
                key={`${ev.ts}-${idx}`}
                className={`p-2.5 rounded-sm border text-xs flex items-start gap-2.5 ${
                  isBreak
                    ? "bg-warn-bg border-warn/30 text-text-primary"
                    : isOverdraft
                    ? "bg-neg-bg border-neg/30 text-text-primary"
                    : "bg-info-bg border-info/30 text-text-primary"
                }`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {isBreak ? (
                    <AlertCircle className="w-4 h-4 text-warn" aria-hidden="true" />
                  ) : isOverdraft ? (
                    <AlertOctagon className="w-4 h-4 text-neg" aria-hidden="true" />
                  ) : (
                    <Bell className="w-4 h-4 text-info" aria-hidden="true" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 font-mono text-2xs">
                    <span
                      className={`font-bold uppercase tracking-wide ${
                        isBreak ? "text-warn" : isOverdraft ? "text-neg" : "text-info"
                      }`}
                    >
                      {isBreak
                        ? "Repo Early Redemption"
                        : isOverdraft
                        ? "Emergency Overdraft"
                        : "System Alert"}
                    </span>
                    <span className="text-text-muted tabular-nums">
                      {ev.ts.replace("T", " ").slice(0, 16)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-text-primary text-xs leading-relaxed font-sans">
                    {ev.message}
                  </p>
                  {(ev.amount > 0 || ev.fee > 0) && (
                    <div className="mt-1 flex items-center gap-3 text-2xs font-mono text-text-muted tabular-nums">
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

export default EventFeed;
