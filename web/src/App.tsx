/**
 * App.tsx: Root application component.
 * - Initializes singleton WebSocket connection and Zustand store at root (survives routing)
 * - Holds memory-only theme state (no localStorage / sessionStorage)
 * - Configures React Router with routes: Live Treasury, Strategy Performance, Stress Lab, Decision Log, Methodology
 * - Enforces AppShell layout with permanent disclaimer banner, persistent desktop sidebar, and mobile drawer
 */

import React, { useState, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useReplaySocket } from "./hooks/useReplaySocket";
import AppShell from "./components/common/AppShell";
import LiveTreasuryPage from "./pages/LiveTreasuryPage";
import StrategicSleevePage from "./pages/StrategicSleevePage";
import StrategyPerformancePage from "./pages/StrategyPerformancePage";
import StressLabPage from "./pages/StressLabPage";
import DecisionLogPage from "./pages/DecisionLogPage";
import MethodologyPage from "./pages/MethodologyPage";

export const App: React.FC = () => {
  // Initialize singleton WebSocket connection at root
  useReplaySocket();

  // Dark mode by default, toggleable in memory only (no localStorage or sessionStorage)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

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
    <HashRouter>
      <AppShell isDarkMode={isDarkMode} onToggleTheme={toggleTheme}>
        <Routes>
          <Route path="/" element={<LiveTreasuryPage />} />
          <Route path="/sleeve" element={<StrategicSleevePage />} />
          <Route path="/strategies" element={<StrategyPerformancePage />} />
          <Route path="/stress" element={<StressLabPage />} />
          <Route path="/decisions" element={<DecisionLogPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
};

export default App;
