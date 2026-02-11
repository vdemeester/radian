import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getBucketSize,
  bucketLabel,
  buildTimeSeries,
  type TimeSeriesPoint,
  type TrendMetric,
} from "./trends.js";
import type { SessionStats } from "./types.js";

function makeSession(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    id: "test",
    cwd: "/test",
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
    tools: new Map([["bash", { calls: 3, errors: 0 }], ["read", { calls: 1, errors: 0 }]]),
    models: new Map([["claude@copilot", { calls: 5, tokens: 230, cost: 0.05 }]]),
    ...overrides,
  };
}

describe("getBucketSize", () => {
  it("returns hourly for today", () => {
    expect(getBucketSize("today")).toBe("hourly");
  });

  it("returns daily for week", () => {
    expect(getBucketSize("week")).toBe("daily");
  });

  it("returns daily for month", () => {
    expect(getBucketSize("month")).toBe("daily");
  });

  it("returns weekly for quarter", () => {
    expect(getBucketSize("quarter")).toBe("weekly");
  });

  it("returns monthly for year", () => {
    expect(getBucketSize("year")).toBe("monthly");
  });

  it("returns monthly for all", () => {
    expect(getBucketSize("all")).toBe("monthly");
  });
});

describe("bucketLabel", () => {
  it("formats hourly labels", () => {
    const label = bucketLabel(new Date("2026-02-10T14:00:00Z"), "hourly");
    expect(label).toMatch(/14:00/);
  });

  it("formats daily labels", () => {
    const label = bucketLabel(new Date("2026-02-10T00:00:00Z"), "daily");
    expect(label).toMatch(/Feb 10/);
  });

  it("formats weekly labels", () => {
    const label = bucketLabel(new Date("2026-02-10T00:00:00Z"), "weekly");
    expect(label).toMatch(/W\d+/);
  });

  it("formats monthly labels", () => {
    const label = bucketLabel(new Date("2026-02-01T00:00:00Z"), "monthly");
    expect(label).toMatch(/Feb/);
  });
});

describe("buildTimeSeries", () => {
  const sessions = [
    makeSession({
      id: "s1",
      startTime: new Date("2026-02-10T08:00:00Z"),
      messageCount: 10,
      toolCalls: 4,
      tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, total: 150 },
    }),
    makeSession({
      id: "s2",
      startTime: new Date("2026-02-10T14:00:00Z"),
      messageCount: 20,
      toolCalls: 8,
      tokens: { input: 200, output: 100, cacheRead: 0, cacheWrite: 0, total: 300 },
    }),
    makeSession({
      id: "s3",
      startTime: new Date("2026-02-11T10:00:00Z"),
      messageCount: 15,
      toolCalls: 6,
      tokens: { input: 150, output: 75, cacheRead: 0, cacheWrite: 0, total: 225 },
    }),
  ];

  it("aggregates tokens by day", () => {
    const series = buildTimeSeries(sessions, "tokens", "daily");
    // Feb 10: 150 + 300 = 450, Feb 11: 225
    expect(series.length).toBe(2);
    expect(series[0].value).toBe(450);
    expect(series[1].value).toBe(225);
  });

  it("aggregates sessions by day", () => {
    const series = buildTimeSeries(sessions, "sessions", "daily");
    expect(series[0].value).toBe(2); // Feb 10: 2 sessions
    expect(series[1].value).toBe(1); // Feb 11: 1 session
  });

  it("aggregates tool-calls by day", () => {
    const series = buildTimeSeries(sessions, "tool-calls", "daily");
    expect(series[0].value).toBe(12); // Feb 10: 4 + 8
    expect(series[1].value).toBe(6);  // Feb 11: 6
  });

  it("aggregates messages by day", () => {
    const series = buildTimeSeries(sessions, "messages", "daily");
    expect(series[0].value).toBe(30); // Feb 10: 10 + 20
    expect(series[1].value).toBe(15); // Feb 11: 15
  });

  it("aggregates by hour", () => {
    const series = buildTimeSeries(sessions, "sessions", "hourly");
    // s1 at 08:00, s2 at 14:00, s3 at 10:00 next day
    // Should have separate buckets for each hour
    expect(series.length).toBeGreaterThanOrEqual(2);
    expect(series.find(p => p.label.includes("08"))?.value).toBe(1);
    expect(series.find(p => p.label.includes("14"))?.value).toBe(1);
  });

  it("aggregates by month", () => {
    const monthSessions = [
      makeSession({ id: "s1", startTime: new Date("2026-01-15T10:00:00Z"), toolCalls: 5 }),
      makeSession({ id: "s2", startTime: new Date("2026-01-20T10:00:00Z"), toolCalls: 3 }),
      makeSession({ id: "s3", startTime: new Date("2026-02-10T10:00:00Z"), toolCalls: 7 }),
    ];
    const series = buildTimeSeries(monthSessions, "tool-calls", "monthly");
    expect(series.length).toBe(2);
    expect(series[0].value).toBe(8);  // Jan: 5 + 3
    expect(series[1].value).toBe(7);  // Feb: 7
  });

  it("returns empty array for no sessions", () => {
    const series = buildTimeSeries([], "tokens", "daily");
    expect(series.length).toBe(0);
  });
});

describe("buildTimeSeries with --by breakdown", () => {
  const sessions = [
    makeSession({
      id: "s1",
      startTime: new Date("2026-02-10T10:00:00Z"),
      tools: new Map([["bash", { calls: 5, errors: 0 }], ["read", { calls: 3, errors: 0 }]]),
      models: new Map([["claude@copilot", { calls: 2, tokens: 100, cost: 0 }]]),
      project: "home",
    }),
    makeSession({
      id: "s2",
      startTime: new Date("2026-02-10T14:00:00Z"),
      tools: new Map([["bash", { calls: 2, errors: 0 }], ["edit", { calls: 4, errors: 0 }]]),
      models: new Map([["gpt5@openai", { calls: 3, tokens: 200, cost: 0 }]]),
      project: "pipeline",
    }),
    makeSession({
      id: "s3",
      startTime: new Date("2026-02-11T10:00:00Z"),
      tools: new Map([["bash", { calls: 1, errors: 0 }]]),
      models: new Map([["claude@copilot", { calls: 1, tokens: 50, cost: 0 }]]),
      project: "home",
    }),
  ];

  it("breaks down tool-calls by tool", () => {
    const series = buildTimeSeries(sessions, "tool-calls", "daily", { by: "tool", top: 5 });
    // Each point should have a breakdown map
    expect(series[0].breakdown).toBeDefined();
    // Feb 10: bash=7, read=3, edit=4
    expect(series[0].breakdown!.get("bash")).toBe(7);
    expect(series[0].breakdown!.get("read")).toBe(3);
    expect(series[0].breakdown!.get("edit")).toBe(4);
    // Feb 11: bash=1
    expect(series[1].breakdown!.get("bash")).toBe(1);
  });

  it("breaks down tokens by model", () => {
    const series = buildTimeSeries(sessions, "tokens", "daily", { by: "model", top: 5 });
    // Feb 10: claude=100, gpt5=200
    expect(series[0].breakdown!.get("claude")).toBe(100);
    expect(series[0].breakdown!.get("gpt5")).toBe(200);
  });

  it("breaks down sessions by project", () => {
    const series = buildTimeSeries(sessions, "sessions", "daily", { by: "project", top: 5 });
    // Feb 10: home=1, pipeline=1
    expect(series[0].breakdown!.get("home")).toBe(1);
    expect(series[0].breakdown!.get("pipeline")).toBe(1);
    // Feb 11: home=1
    expect(series[1].breakdown!.get("home")).toBe(1);
  });

  it("limits breakdown to top N + other", () => {
    const manySessions = [
      makeSession({
        id: "s1",
        startTime: new Date("2026-02-10T10:00:00Z"),
        tools: new Map([
          ["bash", { calls: 10, errors: 0 }],
          ["read", { calls: 8, errors: 0 }],
          ["edit", { calls: 6, errors: 0 }],
          ["write", { calls: 4, errors: 0 }],
          ["github", { calls: 2, errors: 0 }],
          ["jira", { calls: 1, errors: 0 }],
        ]),
      }),
    ];
    const series = buildTimeSeries(manySessions, "tool-calls", "daily", { by: "tool", top: 3 });
    const keys = [...series[0].breakdown!.keys()];
    // Top 3 + "other"
    expect(keys.length).toBe(4);
    expect(keys).toContain("other");
    expect(series[0].breakdown!.get("other")).toBe(7); // 4 + 2 + 1
  });
});
