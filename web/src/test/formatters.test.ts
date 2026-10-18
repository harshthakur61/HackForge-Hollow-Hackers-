import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatMillions,
  formatBps,
  formatPercent,
  formatSimClock,
  formatDeltaCurrency,
  formatDeltaNumber,
  formatHourOffset,
} from "../utils/formatters";

describe("formatters utility tests", () => {
  it("formats currency correctly and handles negative numbers", () => {
    expect(formatCurrency(1234567.89)).toBe("$1,234,567.89");
    expect(formatCurrency(-500000)).toBe("-$500,000.00");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("formats millions correctly with decimals", () => {
    expect(formatMillions(100_000_000)).toBe("$100.0M");
    expect(formatMillions(9_919_004.26, 1)).toBe("$9.9M");
    expect(formatMillions(-2_500_000, 2)).toBe("-$2.50M");
    expect(formatMillions(null)).toBe("—");
  });

  it("formats basis points correctly", () => {
    expect(formatBps(276.18, 1)).toBe("276.2 bps");
    expect(formatBps(-751.38, 2)).toBe("-751.38 bps");
    expect(formatBps(null)).toBe("—");
  });

  it("formats percentages correctly", () => {
    expect(formatPercent(100.0)).toBe("100.0%");
    expect(formatPercent(0.9783, 2, true)).toBe("97.83%");
    expect(formatPercent(null)).toBe("—");
  });

  it("extracts date and time from simulation ISO strings", () => {
    expect(formatSimClock("2026-02-26T17:00:00")).toEqual({
      date: "2026-02-26",
      time: "17:00",
    });
    expect(formatSimClock(null)).toEqual({
      date: "—",
      time: "—",
    });
  });

  it("formats delta currency with explicit plus/minus signs", () => {
    expect(formatDeltaCurrency(50000.25)).toBe("+$50,000.25");
    expect(formatDeltaCurrency(-12500)).toBe("-$12,500.00");
    expect(formatDeltaCurrency(0)).toBe("$0.00");
    expect(formatDeltaCurrency(null)).toBe("—");
  });

  it("formats delta number with plus/minus signs", () => {
    expect(formatDeltaNumber(5)).toBe("+5");
    expect(formatDeltaNumber(-3)).toBe("-3");
    expect(formatDeltaNumber(0)).toBe("0");
    expect(formatDeltaNumber(null)).toBe("—");
  });

  it("formats overnight hour offsets accurately", () => {
    expect(formatHourOffset(0)).toBe("17:00 (D)");
    expect(formatHourOffset(7)).toBe("00:00 (D+1)");
    expect(formatHourOffset(14)).toBe("07:00 (D+1)");
  });
});
