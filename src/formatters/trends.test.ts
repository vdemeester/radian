import { describe, it, expect, vi } from "vitest";
import { formatTrendLine, formatTrendSummary } from "./trends.js";
import type { TimeSeriesPoint } from "../trends.js";

describe("formatTrendLine", () => {
  it("renders a single value bar", () => {
    const point: TimeSeriesPoint = { date: new Date(), label: "Feb 10", value: 50, };
    const line = formatTrendLine(point, 100, 20);
    expect(line).toContain("Feb 10");
    expect(line).toContain("██████████"); // ~50% of 20
    expect(line).toContain("50");
  });

  it("renders zero value with dash", () => {
    const point: TimeSeriesPoint = { date: new Date(), label: "Feb 10", value: 0 };
    const line = formatTrendLine(point, 100, 20);
    expect(line).toContain("—");
  });

  it("renders full bar for max value", () => {
    const point: TimeSeriesPoint = { date: new Date(), label: "Feb 10", value: 100 };
    const line = formatTrendLine(point, 100, 10);
    expect(line).toContain("██████████");
  });
});

describe("formatTrendSummary", () => {
  it("computes total, avg, and peak", () => {
    const series: TimeSeriesPoint[] = [
      { date: new Date(), label: "Feb 09", value: 30 },
      { date: new Date(), label: "Feb 10", value: 80 },
      { date: new Date(), label: "Feb 11", value: 50 },
    ];
    const summary = formatTrendSummary(series);
    expect(summary.total).toBe(160);
    expect(summary.avg).toBeCloseTo(53.3, 0);
    expect(summary.peak.value).toBe(80);
    expect(summary.peak.label).toBe("Feb 10");
  });

  it("handles single point", () => {
    const series: TimeSeriesPoint[] = [
      { date: new Date(), label: "Feb 10", value: 42 },
    ];
    const summary = formatTrendSummary(series);
    expect(summary.total).toBe(42);
    expect(summary.avg).toBe(42);
    expect(summary.peak.value).toBe(42);
  });

  it("handles empty series", () => {
    const summary = formatTrendSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.avg).toBe(0);
    expect(summary.peak.value).toBe(0);
  });
});
