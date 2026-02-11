/**
 * Time-series bucketing engine for trends.
 * Groups session data into time buckets with optional breakdown by dimension.
 */

import type { PeriodName, SessionStats } from "./types.js";
import { splitModelKey } from "./utils.js";

export type BucketSize = "hourly" | "daily" | "weekly" | "monthly";
export type TrendMetric = "tokens" | "sessions" | "tool-calls" | "messages";
export type BreakdownDimension = "tool" | "model" | "provider" | "project";

export interface TimeSeriesPoint {
  /** Bucket start timestamp. */
  date: Date;
  /** Human-readable label (e.g., "Feb 10", "W07", "14:00"). */
  label: string;
  /** Aggregated value for this bucket. */
  value: number;
  /** Optional breakdown by dimension (e.g., tool name → count). */
  breakdown?: Map<string, number>;
}

export interface BreakdownOptions {
  by: BreakdownDimension;
  top: number;
}

/** Auto-select bucket granularity based on period. */
export function getBucketSize(period: PeriodName): BucketSize {
  switch (period) {
    case "today": return "hourly";
    case "week": return "daily";
    case "month": return "daily";
    case "quarter": return "weekly";
    case "year": return "monthly";
    case "all": return "monthly";
  }
}

/** Format a bucket start date as a human-readable label. */
export function bucketLabel(date: Date, size: BucketSize): string {
  switch (size) {
    case "hourly":
      return date.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
    case "daily":
      return date.toLocaleString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
    case "weekly": {
      // ISO week number
      const d = new Date(date);
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      return `W${String(weekNo).padStart(2, "0")}`;
    }
    case "monthly":
      return date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
}

/** Get the bucket key for a date at a given granularity. */
function bucketKey(date: Date, size: BucketSize): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const h = date.getUTCHours();

  switch (size) {
    case "hourly":
      return `${y}-${m}-${d}-${h}`;
    case "daily":
      return `${y}-${m}-${d}`;
    case "weekly": {
      // ISO week
      const dt = new Date(date);
      dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      return `${dt.getUTCFullYear()}-W${weekNo}`;
    }
    case "monthly":
      return `${y}-${m}`;
  }
}

/** Get the bucket start date for a given date and size. */
function bucketStart(date: Date, size: BucketSize): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const h = date.getUTCHours();

  switch (size) {
    case "hourly":
      return new Date(Date.UTC(y, m, d, h));
    case "daily":
      return new Date(Date.UTC(y, m, d));
    case "weekly": {
      const dt = new Date(Date.UTC(y, m, d));
      const day = dt.getUTCDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      dt.setUTCDate(dt.getUTCDate() - diff);
      return dt;
    }
    case "monthly":
      return new Date(Date.UTC(y, m, 1));
  }
}

/** Extract the metric value from a session. */
function metricValue(session: SessionStats, metric: TrendMetric): number {
  switch (metric) {
    case "tokens": return session.tokens.total;
    case "sessions": return 1;
    case "tool-calls": return session.toolCalls;
    case "messages": return session.messageCount;
  }
}

/** Extract breakdown contributions from a session for a given dimension. */
function breakdownValues(
  session: SessionStats,
  metric: TrendMetric,
  dimension: BreakdownDimension,
): Map<string, number> {
  const result = new Map<string, number>();

  switch (dimension) {
    case "tool":
      for (const [name, data] of session.tools) {
        result.set(name, data.calls);
      }
      break;
    case "model":
      for (const [key, data] of session.models) {
        const [model] = splitModelKey(key);
        result.set(model, metric === "tokens" ? data.tokens : data.calls);
      }
      break;
    case "provider":
      for (const [key, data] of session.models) {
        const [, provider] = splitModelKey(key);
        const existing = result.get(provider) ?? 0;
        result.set(provider, existing + (metric === "tokens" ? data.tokens : data.calls));
      }
      break;
    case "project":
      result.set(session.project, metric === "sessions" ? 1 : metricValue(session, metric));
      break;
  }

  return result;
}

/** Build a time series from sessions, optionally broken down by a dimension. */
export function buildTimeSeries(
  sessions: SessionStats[],
  metric: TrendMetric,
  size: BucketSize,
  breakdown?: BreakdownOptions,
): TimeSeriesPoint[] {
  if (sessions.length === 0) return [];

  // Group sessions into buckets
  const buckets = new Map<string, {
    date: Date;
    value: number;
    breakdown: Map<string, number>;
  }>();

  for (const session of sessions) {
    const key = bucketKey(session.startTime, size);

    if (!buckets.has(key)) {
      buckets.set(key, {
        date: bucketStart(session.startTime, size),
        value: 0,
        breakdown: new Map(),
      });
    }

    const bucket = buckets.get(key)!;
    bucket.value += metricValue(session, metric);

    // Breakdown
    if (breakdown) {
      const values = breakdownValues(session, metric, breakdown.by);
      for (const [name, val] of values) {
        bucket.breakdown.set(name, (bucket.breakdown.get(name) ?? 0) + val);
      }
    }
  }

  // Sort by date
  const sorted = [...buckets.values()].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Apply top-N + "other" to breakdowns
  if (breakdown) {
    // Find global top-N keys by total across all buckets
    const globalTotals = new Map<string, number>();
    for (const bucket of sorted) {
      for (const [name, val] of bucket.breakdown) {
        globalTotals.set(name, (globalTotals.get(name) ?? 0) + val);
      }
    }
    const topKeys = [...globalTotals.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, breakdown.top)
      .map(([name]) => name);
    const topSet = new Set(topKeys);

    // Collapse non-top keys into "other"
    for (const bucket of sorted) {
      const collapsed = new Map<string, number>();
      let other = 0;
      for (const [name, val] of bucket.breakdown) {
        if (topSet.has(name)) {
          collapsed.set(name, val);
        } else {
          other += val;
        }
      }
      if (other > 0) collapsed.set("other", other);
      bucket.breakdown = collapsed;
    }
  }

  return sorted.map((bucket) => ({
    date: bucket.date,
    label: bucketLabel(bucket.date, size),
    value: bucket.value,
    breakdown: breakdown ? bucket.breakdown : undefined,
  }));
}
