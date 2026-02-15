import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { periodToRange, filterSessions, getFilterLabel } from "./filters.js";
import type { SessionStats } from "./types.js";

function makeSession(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    id: "test",
    cwd: "/home/user/src/myproject",
    project: "myproject",
    startTime: new Date("2026-02-10T10:00:00Z"),
    endTime: new Date("2026-02-10T10:30:00Z"),
    duration: 1800000,
    messageCount: 10,
    userMessages: 3,
    assistantMessages: 5,
    toolCalls: 4,
    toolResults: 4,
    toolErrors: 0,
    tokens: { input: 100, output: 50, cacheRead: 80, cacheWrite: 0, total: 230 },
    cost: 0.05,
    tools: new Map(),
    models: new Map(),
    ...overrides,
  };
}

describe("periodToRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Wednesday Feb 11 2026, 15:00 UTC
    vi.setSystemTime(new Date("2026-02-11T15:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("today starts at midnight", () => {
    const { from } = periodToRange("today");
    expect(from.getDate()).toBe(11);
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
  });

  it("week starts on Monday", () => {
    const { from } = periodToRange("week");
    // Feb 11 2026 is Wednesday, so Monday is Feb 9
    expect(from.getDate()).toBe(9);
  });

  it("month starts on the 1st", () => {
    const { from } = periodToRange("month");
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(1); // February
  });

  it("quarter starts correctly", () => {
    const { from, label } = periodToRange("quarter");
    expect(from.getMonth()).toBe(0); // January (Q1)
    expect(from.getDate()).toBe(1);
    expect(label).toContain("Q1");
  });

  it("year starts Jan 1", () => {
    const { from } = periodToRange("year");
    expect(from.getMonth()).toBe(0);
    expect(from.getDate()).toBe(1);
    expect(from.getFullYear()).toBe(2026);
  });

  it("all starts at epoch", () => {
    const { from, label } = periodToRange("all");
    expect(from.getTime()).toBe(0);
    expect(label).toBe("All time");
  });
});

describe("filterSessions", () => {
  const sessions = [
    makeSession({ id: "s1", project: "home", startTime: new Date("2026-02-10T10:00:00Z") }),
    makeSession({ id: "s2", project: "tektoncd/pipeline", startTime: new Date("2026-02-11T14:00:00Z") }),
    makeSession({ id: "s3", project: "home", startTime: new Date("2026-01-15T10:00:00Z") }),
    makeSession({ id: "s4", project: "nixpkgs", startTime: new Date("2025-06-01T10:00:00Z") }),
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T15:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters by period=week", () => {
    const result = filterSessions(sessions, { period: "week" });
    expect(result.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("filters by period=month", () => {
    const result = filterSessions(sessions, { period: "month" });
    expect(result.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("filters by period=year", () => {
    const result = filterSessions(sessions, { period: "year" });
    expect(result.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("filters by period=all", () => {
    const result = filterSessions(sessions, { period: "all" });
    expect(result.length).toBe(4);
  });

  it("filters by project substring", () => {
    const result = filterSessions(sessions, { period: "all", project: "tekton" });
    expect(result.map((s) => s.id)).toEqual(["s2"]);
  });

  it("project filter is case-insensitive", () => {
    const result = filterSessions(sessions, { period: "all", project: "TEKTON" });
    expect(result.map((s) => s.id)).toEqual(["s2"]);
  });

  it("filters by explicit from/to dates", () => {
    const result = filterSessions(sessions, {
      period: "all", // ignored when from/to set
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-01-31T23:59:59Z"),
    });
    expect(result.map((s) => s.id)).toEqual(["s3"]);
  });

  it("combines period and project filters", () => {
    const result = filterSessions(sessions, { period: "year", project: "home" });
    expect(result.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("excludes a single project", () => {
    const result = filterSessions(sessions, { period: "all", excludeProjects: ["home"] });
    expect(result.map((s) => s.id)).toEqual(["s2", "s4"]);
  });

  it("excludes multiple projects", () => {
    const result = filterSessions(sessions, { period: "all", excludeProjects: ["home", "nixpkgs"] });
    expect(result.map((s) => s.id)).toEqual(["s2"]);
  });

  it("exclude filter is case-insensitive", () => {
    const result = filterSessions(sessions, { period: "all", excludeProjects: ["HOME"] });
    expect(result.map((s) => s.id)).toEqual(["s2", "s4"]);
  });

  it("exclude uses substring match", () => {
    const result = filterSessions(sessions, { period: "all", excludeProjects: ["tekton"] });
    expect(result.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
  });

  it("combines period, project, and exclude filters", () => {
    // year includes s1, s2, s3. Exclude "home" removes s1 and s3.
    const result = filterSessions(sessions, { period: "year", excludeProjects: ["home"] });
    expect(result.map((s) => s.id)).toEqual(["s2"]);
  });

  it("empty exclude list has no effect", () => {
    const result = filterSessions(sessions, { period: "all", excludeProjects: [] });
    expect(result.length).toBe(4);
  });
});

describe("getFilterLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T15:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns period label for period-based filters", () => {
    const label = getFilterLabel({ period: "all" });
    expect(label).toBe("All time");
  });

  it("returns date range for explicit from/to", () => {
    const label = getFilterLabel({
      period: "all",
      from: new Date("2026-01-01"),
      to: new Date("2026-01-31"),
    });
    expect(label).toContain("2026-01-01");
    expect(label).toContain("2026-01-31");
  });
});
