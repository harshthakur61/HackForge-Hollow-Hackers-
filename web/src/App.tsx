/**
 * App.tsx: Root dashboard layout wiring all Reserve Juggler components:
 * TopBar, Controls, BalanceCards, ReserveGauge, NightChart, KpiStrip,
 * StrategyRace, ForecastVsActual, DecisionLog, and EventFeed.
 */

import React, { useState, useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { Controls } from "./components/Controls";
import { BalanceCards } from "./components/BalanceCards";
import { ReserveGauge } from "./components/ReserveGauge";
import { NightChart } from "./components/NightChart";
import { KpiStrip } from "./components/KpiStrip";
import { StrategyRace } from "./components/StrategyRace";
import { ForecastVsActual } from "./components/ForecastVsActual";
import { DecisionLog } from "./components/DecisionLog";
import { EventFeed } from "./components/EventFeed";
import { useReplaySocket } from "./hooks/useReplaySocket";

export const App: React.FC = () => {
  // Initialize singleton socket connection
  useReplaySocket();

  // Dark mode by default, toggleable without localStorage
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans transition-colors duration-200">
      <TopBar isDarkMode={isDarkMode} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* Playback Controls & Policy Parameter Settings */}
        <Controls />

        {/* Real-time Balances & Sweep Allocation */}
        <BalanceCards />

        {/* Current Night Reserve vs Quantile Forecasts Gauge */}
        <ReserveGauge />

        {/* Live Overnight Progression & Cumulative Performance Strip */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <NightChart />
          <div className="space-y-4">
            <KpiStrip />
          </div>
        </div>

        {/* Strategy Performance Comparison & Risk Coverage Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <StrategyRace />
          <ForecastVsActual />
        </div>

        {/* Historical Audit Trail & Operational Events */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2">
            <DecisionLog />
          </div>
          <div className="lg:col-span-1">
            <EventFeed />
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Reserve Juggler v1.0.0 — Pure deterministic Python policy engine with real-time Node orchestration.
      </footer>
    </div>
  );
};

export default App;
