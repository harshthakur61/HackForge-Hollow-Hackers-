import React from "react";
import {
  Menu,
  Sun,
  Moon,
  Clock,
  AlertTriangle,
  Server,
} from "lucide-react";
import { useReplayStore } from "../../store/useReplayStore";
import { formatSimClock } from "../../utils/formatters";

export interface TopBarProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenMobileMenu?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  isDarkMode,
  onToggleTheme,
  onOpenMobileMenu,
}) => {
  const connection = useReplayStore((s) => s.connection);
  const simTime = useReplayStore((s) => s.replayStatus.simTime);
  const validationBadges = useReplayStore((s) => s.validationBadges);
  const dismissValidationError = useReplayStore((s) => s.dismissValidationError);

  const clock = formatSimClock(simTime);

  // Phase: 17:00 to 07:00 is NIGHT (live simulation); 08:00 to 16:00 is DAY (not simulated)
  const hour = clock.time !== "—" ? parseInt(clock.time.split(":")[0], 10) : 17;
  const isNight = hour >= 17 || hour <= 7;

  const getConnectionDetails = () => {
    switch (connection) {
      case "connected":
        return {
          label: "Connected",
          dotClass: "bg-pos",
          containerClass: "bg-pos-bg text-pos border-pos/30",
        };
      case "reconnecting":
        return {
          label: "Reconnecting",
          dotClass: "bg-warn",
          containerClass: "bg-warn-bg text-warn border-warn/30",
        };
      case "engine_down":
        return {
          label: "Engine Down",
          dotClass: "bg-neg",
          containerClass: "bg-neg-bg text-neg border-neg/30",
        };
      case "disconnected":
      default:
        return {
          label: "Disconnected",
          dotClass: "bg-neg",
          containerClass: "bg-neg-bg text-neg border-neg/30",
        };
    }
  };

  const conn = getConnectionDetails();

  return (
    <header className="h-14 bg-surface border-b border-border-subtle sticky top-0 z-40 px-4 sm:px-6 flex items-center justify-between gap-3">
      {/* Validation warning alerts */}
      {validationBadges.length > 0 && (
        <div
          role="alert"
          className="absolute top-14 left-0 right-0 z-50 bg-neg-bg border-b border-neg/30 px-4 py-2 space-y-1 shadow-sm"
        >
          {validationBadges.map((badge) => (
            <div
              key={badge.id}
              className="max-w-7xl mx-auto flex items-center justify-between text-xs text-neg font-medium"
            >
              <div className="flex items-center gap-2 truncate">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Contract Validation Warning: Event <code className="font-mono bg-neg/10 px-1 py-0.5 rounded-xs">{badge.eventName}</code> {badge.message}
                </span>
              </div>
              <button
                type="button"
                onClick={() => dismissValidationError(badge.id)}
                className="underline hover:no-underline ml-3 flex-shrink-0 text-neg focus:outline-none focus-visible:ring-1 focus-visible:ring-neg"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Left section: Mobile menu toggle + Connection status */}
      <div className="flex items-center gap-3">
        {onOpenMobileMenu && (
          <button
            type="button"
            id="mobile-menu-button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="lg:hidden p-1.5 rounded-sm text-text-secondary hover:text-text-primary hover:bg-subtle border border-border-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            <Menu className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        {/* Connection status pill */}
        <div
          id="connection-pill"
          role="status"
          aria-label={`Connection status: ${conn.label}`}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs text-xs font-medium border ${conn.containerClass}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${conn.dotClass}`} aria-hidden="true" />
          <Server className="w-3 h-3 opacity-80" aria-hidden="true" />
          <span className="tracking-wide">{conn.label}</span>
        </div>
      </div>

      {/* Right section: Clock, Phase badge, Theme toggle */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Simulated 24-hour clock */}
        <div
          id="simulated-clock"
          aria-label={`Simulated time: ${clock.date} ${clock.time}`}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-subtle border border-border-subtle text-xs tabular-nums text-text-primary font-mono"
        >
          <Clock className="w-3.5 h-3.5 text-text-muted flex-shrink-0" aria-hidden="true" />
          <span className="text-text-secondary hidden sm:inline">{clock.date}</span>
          <span className="font-semibold text-text-primary">{clock.time}</span>
        </div>

        {/* Phase badge */}
        <div
          id="phase-badge"
          role="status"
          aria-label={`Current phase: ${isNight ? "Night, live simulation" : "Day, not simulated"}`}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-xs text-xs font-medium border ${
            isNight
              ? "bg-accent-subtle text-accent-primary border-accent-primary/30"
              : "bg-subtle text-text-muted border-border-subtle"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isNight ? "bg-accent-primary" : "bg-text-muted"
            }`}
            aria-hidden="true"
          />
          <span className="font-semibold">
            {isNight ? "NIGHT (live)" : "DAY (idle)"}
          </span>
        </div>

        {/* Memory-only Theme toggle */}
        <button
          type="button"
          id="theme-toggle"
          onClick={onToggleTheme}
          aria-label={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
          className="p-1.5 rounded-sm border border-border-subtle bg-surface hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        >
          {isDarkMode ? (
            <Sun className="w-4 h-4 text-text-secondary" aria-hidden="true" />
          ) : (
            <Moon className="w-4 h-4 text-text-secondary" aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
};

export default TopBar;
