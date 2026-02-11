import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatNum, formatDuration, formatRelativeTime, formatPct, bar } from "./utils.js";

describe("formatNum", () => {
  it("formats small numbers with commas", () => {
    expect(formatNum(42)).toBe("42");
    expect(formatNum(1234)).toBe("1,234");
    expect(formatNum(9999)).toBe("9,999");
  });

  it("formats thousands as K", () => {
    expect(formatNum(10000)).toBe("10.0K");
    expect(formatNum(45200)).toBe("45.2K");
    expect(formatNum(999999)).toBe("1000.0K");
  });

  it("formats millions as M", () => {
    expect(formatNum(1000000)).toBe("1.0M");
    expect(formatNum(2500000)).toBe("2.5M");
  });
});

describe("formatDuration", () => {
  it("formats sub-second", () => {
    expect(formatDuration(500)).toBe("<1s");
  });

  it("formats seconds", () => {
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(59000)).toBe("59s");
  });

  it("formats minutes", () => {
    expect(formatDuration(60000)).toBe("1min");
    expect(formatDuration(300000)).toBe("5min");
    expect(formatDuration(3540000)).toBe("59min");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(3600000)).toBe("1h");
    expect(formatDuration(5400000)).toBe("1h 30min");
    expect(formatDuration(7200000)).toBe("2h");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T15:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'today' for same day", () => {
    expect(formatRelativeTime(new Date("2026-02-11T10:00:00Z"))).toBe("today");
  });

  it("returns 'yesterday' for one day ago", () => {
    expect(formatRelativeTime(new Date("2026-02-10T10:00:00Z"))).toBe("yesterday");
  });

  it("returns 'N days ago' for less than a week", () => {
    expect(formatRelativeTime(new Date("2026-02-08T10:00:00Z"))).toBe("3 days ago");
  });

  it("returns 'N weeks ago' for weeks", () => {
    expect(formatRelativeTime(new Date("2026-01-28T10:00:00Z"))).toBe("2 weeks ago");
  });

  it("returns 'never' for null", () => {
    expect(formatRelativeTime(null)).toBe("never");
  });
});

describe("formatPct", () => {
  it("formats percentage", () => {
    expect(formatPct(1, 10)).toBe("10.0%");
    expect(formatPct(3, 7)).toBe("42.9%");
  });

  it("handles zero total", () => {
    expect(formatPct(0, 0)).toBe("0.0%");
  });
});

describe("bar", () => {
  it("renders proportional bar", () => {
    const result = bar(5, 10, 10);
    expect(result).toBe("█████░░░░░");
  });

  it("renders empty bar for zero value", () => {
    const result = bar(0, 10, 10);
    expect(result).toBe("░░░░░░░░░░");
  });

  it("renders full bar for max value", () => {
    const result = bar(10, 10, 10);
    expect(result).toBe("██████████");
  });

  it("handles zero max", () => {
    const result = bar(5, 0, 10);
    expect(result).toBe("░░░░░░░░░░");
  });
});
