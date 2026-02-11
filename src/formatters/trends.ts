/**
 * Terminal trend renderer with ASCII bar charts.
 */

import type { TimeSeriesPoint } from "../trends.js";
import { formatNum, padRight, padLeft, bar } from "../utils.js";

const COLORS = [
  "\x1b[36m", // cyan
  "\x1b[33m", // yellow
  "\x1b[32m", // green
  "\x1b[35m", // magenta
  "\x1b[34m", // blue
  "\x1b[31m", // red
];
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BAR_WIDTH = 30;

/** Format a single trend line (no breakdown). */
export function formatTrendLine(point: TimeSeriesPoint, maxValue: number, barWidth: number = BAR_WIDTH): string {
  if (point.value === 0) {
    return `  ${padRight(point.label, 10)}  ${DIM}${"░".repeat(barWidth)}${RESET}  ${DIM}    —${RESET}`;
  }
  return `  ${padRight(point.label, 10)}  ${bar(point.value, maxValue, barWidth)}  ${padLeft(formatNum(point.value), 8)}`;
}

/** Format a trend line with breakdown (stacked bars). */
function formatBreakdownLine(
  point: TimeSeriesPoint,
  maxValue: number,
  sortedKeys: string[],
  barWidth: number = BAR_WIDTH,
): string {
  if (!point.breakdown || point.value === 0) {
    return formatTrendLine(point, maxValue, barWidth);
  }

  let barStr = "";
  let remaining = barWidth;

  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const val = point.breakdown.get(key) ?? 0;
    if (val === 0) continue;

    const color = COLORS[i % COLORS.length];
    const width = Math.max(1, Math.round((val / maxValue) * barWidth));
    const clamped = Math.min(width, remaining);
    barStr += `${color}${"█".repeat(clamped)}${RESET}`;
    remaining -= clamped;
  }

  if (remaining > 0) {
    barStr += `${DIM}${"░".repeat(remaining)}${RESET}`;
  }

  return `  ${padRight(point.label, 10)}  ${barStr}  ${padLeft(formatNum(point.value), 8)}`;
}

/** Compute summary stats from a time series. */
export function formatTrendSummary(series: TimeSeriesPoint[]): {
  total: number;
  avg: number;
  peak: { value: number; label: string };
} {
  if (series.length === 0) {
    return { total: 0, avg: 0, peak: { value: 0, label: "" } };
  }

  const total = series.reduce((sum, p) => sum + p.value, 0);
  const avg = total / series.length;
  const peak = series.reduce((max, p) => (p.value > max.value ? p : max), series[0]);

  return { total, avg, peak: { value: peak.value, label: peak.label } };
}

/** Print a complete trend chart to the terminal. */
export function printTrend(
  series: TimeSeriesPoint[],
  title: string,
  metric: string,
): void {
  console.log(`\n  ${title}\n`);

  if (series.length === 0) {
    console.log("  No data for this period.\n");
    return;
  }

  const maxValue = Math.max(...series.map((p) => p.value));
  const hasBreakdown = series.some((p) => p.breakdown && p.breakdown.size > 0);

  // Get sorted breakdown keys (global order by total)
  let sortedKeys: string[] = [];
  if (hasBreakdown) {
    const totals = new Map<string, number>();
    for (const p of series) {
      if (p.breakdown) {
        for (const [key, val] of p.breakdown) {
          totals.set(key, (totals.get(key) ?? 0) + val);
        }
      }
    }
    sortedKeys = [...totals.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([k]) => k);
  }

  // Print bars
  for (const point of series) {
    if (hasBreakdown) {
      console.log(formatBreakdownLine(point, maxValue, sortedKeys));
    } else {
      console.log(formatTrendLine(point, maxValue));
    }
  }

  // Summary
  const summary = formatTrendSummary(series);
  console.log(`  ${" ".repeat(10)}  ${"─".repeat(BAR_WIDTH + 10)}`);
  console.log(`  ${padRight("Total", 10)}  ${" ".repeat(BAR_WIDTH)}  ${padLeft(formatNum(summary.total), 8)}`);
  console.log(`  ${padRight("Avg", 10)}  ${" ".repeat(BAR_WIDTH)}  ${padLeft(formatNum(Math.round(summary.avg)), 8)}`);
  console.log(`  ${padRight("Peak", 10)}  ${" ".repeat(BAR_WIDTH)}  ${padLeft(formatNum(summary.peak.value), 8)}  (${summary.peak.label})`);

  // Legend for breakdown
  if (hasBreakdown && sortedKeys.length > 0) {
    const legend = sortedKeys.map((key, i) => {
      const color = COLORS[i % COLORS.length];
      return `${color}■${RESET} ${key}`;
    }).join("  ");
    console.log(`\n  Legend: ${legend}`);
  }

  console.log();
}
