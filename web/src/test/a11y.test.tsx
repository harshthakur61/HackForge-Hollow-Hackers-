import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";

import LiveTreasuryPage from "../pages/LiveTreasuryPage";
import StrategicSleevePage from "../pages/StrategicSleevePage";
import StrategyPerformancePage from "../pages/StrategyPerformancePage";
import DecisionLogPage from "../pages/DecisionLogPage";
import MethodologyPage from "../pages/MethodologyPage";
import StressLabPage from "../pages/StressLabPage";
import AppShell from "../components/common/AppShell";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <HashRouter>{ui}</HashRouter>
    </QueryClientProvider>
  );
};

const runAxeCheck = async (container: HTMLElement) => {
  const results = await axe.run(container, {
    rules: {
      // In JSDOM, color-contrast checks can be noisy due to zero computed styles
      "color-contrast": { enabled: false },
    },
  });

  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );

  return seriousOrCritical;
};

describe("Automated Accessibility (axe-core WCAG 2.2 AA)", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  describe("Light Theme", () => {
    it("LiveTreasuryPage has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<LiveTreasuryPage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("StrategicSleevePage has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<StrategicSleevePage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("StrategyPerformancePage has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<StrategyPerformancePage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("DecisionLogPage has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<DecisionLogPage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("MethodologyPage has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<MethodologyPage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("StressLabPage has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<StressLabPage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("AppShell frame has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(
        <AppShell isDarkMode={false} onToggleTheme={() => {}}>
          <div>Content</div>
        </AppShell>
      );
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });
  });

  describe("Dark Theme", () => {
    beforeEach(() => {
      document.documentElement.classList.add("dark");
    });

    it("LiveTreasuryPage in dark mode has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<LiveTreasuryPage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("StrategicSleevePage in dark mode has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<StrategicSleevePage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("StrategyPerformancePage in dark mode has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<StrategyPerformancePage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("DecisionLogPage in dark mode has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<DecisionLogPage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("MethodologyPage in dark mode has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<MethodologyPage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("StressLabPage in dark mode has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(<StressLabPage />);
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });

    it("AppShell frame in dark mode has zero serious or critical a11y violations", async () => {
      const { container } = renderWithProviders(
        <AppShell isDarkMode={true} onToggleTheme={() => {}}>
          <div>Content</div>
        </AppShell>
      );
      const violations = await runAxeCheck(container);
      expect(violations).toEqual([]);
    });
  });
});
