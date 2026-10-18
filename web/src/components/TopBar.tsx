/**
 * TopBar.tsx: Top navigation bar containing application branding, connection pill,
 * validation alert badges, 24-hour simulated clock, phase badge, and permanent disclaimer note.
 */

import React from "react";
import { Activity, AlertTriangle, Shield, Sun, Moon, Sliders } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { formatSimClock } from "../utils/formatters";

interface TopBarProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  activeView: "replay" | "stress";
  onSelectView: (view: "replay" | "stress") => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  isDarkMode,
  onToggleTheme,
  activeView,
  onSelectView,
}) => {
  const connection = useReplayStore((s) => s.connection);
  const simTime = useReplayStore((s) => s.replayStatus.simTime);
  const validationBadges = useReplayStore((s) => s.validationBadges);
  const dismissValidationError = useReplayStore((s) => s.dismissValidationError);

  const clock = formatSimClock(simTime);

  // Phase computation: hour 17 to 07 is NIGHT; 08 to 16 is DAY
  const hour = clock.time !== "—" ? parseInt(clock.time.split(":")[0], 10) : 17;
  const isNight = hour >= 17 || hour <= 7;

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-40 px-4 py-3 sm:px-6">
      {/* Contract validation warning banner if any incoming payload failed zod validation */}
      {validationBadges.length > 0 && (
        <div className="mb-3 space-y-1">
          {validationBadges.map((badge) => (
            <div
              key={badge.id}
              className="flex items-center justify-between px-3 py-1.5 text-xs bg-danger/10 border border-danger/30 text-danger rounded"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Contract Validation Warning:</strong> Event{" "}
                  <code className="font-mono bg-danger/20 px-1 py-0.5 rounded">
                    {badge.eventName}
                  </code>{" "}
                  failed zod validation: {badge.message}
                </span>
              </div>
              <button
                onClick={() => dismissValidationError(badge.id)}
                className="underline hover:no-underline ml-4"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* Left: Branding & Connection Status */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-foreground leading-tight">
                Reserve Juggler
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Autonomous Treasury & Liquidity Buffer Engine
              </p>
            </div>
          </div>

          {/* Connection Pill */}
          <div
            id="connection-pill"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-muted/50"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connection === "connected"
                  ? "bg-success animate-pulse"
                  : connection === "reconnecting"
                  ? "bg-warning animate-ping"
                  : "bg-danger"
              }`}
            />
            <span className="capitalize text-muted-foreground">
              {connection === "connected"
                ? "Connected"
                : connection === "reconnecting"
                ? "Reconnecting"
                : "Engine Down"}
            </span>
          </div>
        </div>

        {/* Navigation Switcher: Replay Dashboard vs Stress Lab */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
            <button
              id="nav-replay"
              onClick={() => onSelectView("replay")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                activeView === "replay"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Replay Dashboard
            </button>
            <button
              id="nav-stress-lab"
              onClick={() => onSelectView("stress")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeView === "stress"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Stress Lab
            </button>
          </div>
        </div>

        {/* Center: Simulated Clock & Phase Badge */}
        <div className="flex items-center gap-3">
          <div
            id="simulated-clock"
            className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border border-border rounded-lg tabular-nums"
          >
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground tracking-wide font-mono">
              {clock.date}
            </span>
            <span className="text-xs font-bold text-primary tracking-wider font-mono">
              {clock.time}
            </span>
          </div>

          {/* Phase Badge */}
          {isNight ? (
            <span
              id="phase-badge"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-400"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              NIGHT (live simulation)
            </span>
          ) : (
            <span
              id="phase-badge"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-500/10 border border-slate-500/20 text-muted-foreground"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              DAY (not simulated)
            </span>
          )}

          {/* Light / Dark Mode Toggle */}
          <button
            onClick={onToggleTheme}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md border border-border hover:bg-muted/80 transition-colors"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Permanent Note */}
      <div className="mt-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>
          Backtest replay of the provided dataset. Daytime hours are not simulated; the pool is replenished externally.
        </span>
        <span className="hidden sm:inline font-mono text-[10px]">Tier 0 Cash + Tier 1 Repo</span>
      </div>
    </header>
  );
};
