import { describe, it, expect } from "vitest";
import { aggregate, topBy } from "./aggregator.js";
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
    toolErrors: 1,
    tokens: { input: 100, output: 50, cacheRead: 80, cacheWrite: 0, total: 230 },
    cost: 0.05,
    tools: new Map([
      ["bash", { calls: 3, errors: 1 }],
      ["read", { calls: 1, errors: 0 }],
    ]),
    models: new Map([
      ["claude-sonnet-4-5@github-copilot", { calls: 5, tokens: 230, cost: 0.05 }],
    ]),
    ...overrides,
  };
}

describe("aggregate", () => {
  it("aggregates totals from multiple sessions", () => {
    const sessions = [
      makeSession({ id: "s1", messageCount: 10, toolCalls: 4, toolErrors: 1 }),
      makeSession({ id: "s2", messageCount: 20, toolCalls: 8, toolErrors: 2 }),
    ];
    const stats = aggregate(sessions, { period: "all" });

    expect(stats.totalSessions).toBe(2);
    expect(stats.totalMessages).toBe(30);
    expect(stats.totalToolCalls).toBe(12);
    expect(stats.totalToolErrors).toBe(3);
  });

  it("aggregates token totals", () => {
    const sessions = [
      makeSession({ id: "s1", tokens: { input: 100, output: 50, cacheRead: 80, cacheWrite: 10, total: 240 } }),
      makeSession({ id: "s2", tokens: { input: 200, output: 100, cacheRead: 160, cacheWrite: 20, total: 480 } }),
    ];
    const stats = aggregate(sessions, { period: "all" });

    expect(stats.totalTokens.input).toBe(300);
    expect(stats.totalTokens.output).toBe(150);
    expect(stats.totalTokens.cacheRead).toBe(240);
    expect(stats.totalTokens.total).toBe(720);
  });

  it("merges tool stats across sessions", () => {
    const s1 = makeSession({
      id: "s1",
      tools: new Map([["bash", { calls: 3, errors: 1 }], ["read", { calls: 2, errors: 0 }]]),
    });
    const s2 = makeSession({
      id: "s2",
      tools: new Map([["bash", { calls: 5, errors: 0 }], ["edit", { calls: 1, errors: 0 }]]),
    });
    const stats = aggregate([s1, s2], { period: "all" });

    const bash = stats.tools.get("bash");
    expect(bash).toBeDefined();
    expect(bash!.calls).toBe(8);
    expect(bash!.errors).toBe(1);
    expect(bash!.sessionIds.size).toBe(2);

    const read = stats.tools.get("read");
    expect(read!.calls).toBe(2);
    expect(read!.sessionIds.size).toBe(1);

    const edit = stats.tools.get("edit");
    expect(edit!.calls).toBe(1);
  });

  it("merges model stats across sessions", () => {
    const s1 = makeSession({
      id: "s1",
      models: new Map([["claude-sonnet-4-5@github-copilot", { calls: 3, tokens: 100, cost: 0.01 }]]),
    });
    const s2 = makeSession({
      id: "s2",
      models: new Map([
        ["claude-sonnet-4-5@github-copilot", { calls: 2, tokens: 80, cost: 0.02 }],
        ["gpt-5@openai", { calls: 1, tokens: 50, cost: 0.005 }],
      ]),
    });
    const stats = aggregate([s1, s2], { period: "all" });

    const sonnet = stats.models.get("claude-sonnet-4-5@github-copilot");
    expect(sonnet!.calls).toBe(5);
    expect(sonnet!.tokens.total).toBe(180);
    expect(sonnet!.cost).toBeCloseTo(0.03);

    const gpt = stats.models.get("gpt-5@openai");
    expect(gpt!.calls).toBe(1);
  });

  it("aggregates projects", () => {
    const sessions = [
      makeSession({ id: "s1", project: "home", messageCount: 10, toolCalls: 5 }),
      makeSession({ id: "s2", project: "home", messageCount: 20, toolCalls: 10 }),
      makeSession({ id: "s3", project: "pipeline", messageCount: 8, toolCalls: 3 }),
    ];
    const stats = aggregate(sessions, { period: "all" });

    expect(stats.projects.get("home")!.sessions).toBe(2);
    expect(stats.projects.get("home")!.messages).toBe(30);
    expect(stats.projects.get("pipeline")!.sessions).toBe(1);
  });

  it("handles empty sessions list", () => {
    const stats = aggregate([], { period: "all" });
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalMessages).toBe(0);
    expect(stats.tools.size).toBe(0);
  });

  it("tracks lastUsed for tools", () => {
    const s1 = makeSession({
      id: "s1",
      endTime: new Date("2026-02-09T10:00:00Z"),
      tools: new Map([["bash", { calls: 1, errors: 0 }]]),
    });
    const s2 = makeSession({
      id: "s2",
      endTime: new Date("2026-02-11T14:00:00Z"),
      tools: new Map([["bash", { calls: 1, errors: 0 }]]),
    });
    const stats = aggregate([s1, s2], { period: "all" });

    const bash = stats.tools.get("bash");
    expect(bash!.lastUsed!.toISOString()).toBe("2026-02-11T14:00:00.000Z");
  });
});

describe("topBy", () => {
  it("finds the top entry by a numeric field", () => {
    const map = new Map([
      ["a", { calls: 5, errors: 1 }],
      ["b", { calls: 10, errors: 0 }],
      ["c", { calls: 3, errors: 2 }],
    ]);
    const result = topBy(map, "calls");
    expect(result).not.toBeNull();
    expect(result![0]).toBe("b");
    expect(result![1].calls).toBe(10);
  });

  it("returns null for empty map", () => {
    const result = topBy(new Map(), "calls" as any);
    expect(result).toBeNull();
  });
});
