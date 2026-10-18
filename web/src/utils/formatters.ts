/**
 * formatters.ts: Deterministic financial number and date formatters.
 * Returns "—" (em-dash) whenever a value is missing or invalid.
 */

import { getModelLabel } from "./labels";

export function formatCurrency(
  val: number | null | undefined,
  decimals: number = 2
): string {
  if (val === null || val === undefined || isNaN(val)) {
    return "—";
  }
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const formatted = absVal.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return isNegative ? `-$${formatted}` : `$${formatted}`;
}

export function formatMillions(
  val: number | null | undefined,
  decimals: number = 1
): string {
  if (val === null || val === undefined || isNaN(val)) {
    return "—";
  }
  const isNegative = val < 0;
  const absM = Math.abs(val) / 1_000_000;
  const formatted = absM.toFixed(decimals);
  return isNegative ? `-$${formatted}M` : `$${formatted}M`;
}

export function formatBps(
  val: number | null | undefined,
  decimals: number = 1
): string {
  if (val === null || val === undefined || isNaN(val)) {
    return "—";
  }
  const formatted = val.toFixed(decimals);
  return `${formatted} bps`;
}

export function formatPercent(
  val: number | null | undefined,
  decimals: number = 1,
  isFraction: boolean = false
): string {
  if (val === null || val === undefined || isNaN(val)) {
    return "—";
  }
  const pct = isFraction ? val * 100 : val;
  return `${pct.toFixed(decimals)}%`;
}

export function formatSimClock(isoString: string | null | undefined): {
  date: string;
  time: string;
} {
  if (!isoString) {
    return { date: "—", time: "—" };
  }
  try {
    const parts = isoString.split("T");
    const date = parts[0] || "—";
    const time = parts[1] ? parts[1].slice(0, 5) : "—";
    return { date, time };
  } catch {
    return { date: "—", time: "—" };
  }
}

export function formatDeltaCurrency(
  val: number | null | undefined,
  decimals: number = 2
): string {
  if (val === null || val === undefined || isNaN(val)) {
    return "—";
  }
  if (Math.abs(val) < 0.005) {
    return "$0.00";
  }
  const isPositive = val > 0;
  const absVal = Math.abs(val);
  const formatted = absVal.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return isPositive ? `+$${formatted}` : `-$${formatted}`;
}

export function formatDeltaNumber(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) {
    return "—";
  }
  if (val === 0) return "0";
  return val > 0 ? `+${val}` : `${val}`;
}

export function formatHourOffset(offset: number): string {
  const hour = (17 + offset) % 24;
  const dayStr = offset < 7 ? "D" : "D+1";
  const hh = String(hour).padStart(2, "0");
  return `${hh}:00 (${dayStr})`;
}

export function translateModelCode(code: string | null | undefined): string {
  return getModelLabel(code || "");
}
