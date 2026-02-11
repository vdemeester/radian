import { describe, it, expect } from "vitest";
import { buildDashboardData, generateHtml } from "./html.js";
import type { SessionStats } from "../types.js";

function makeSession(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    id: "test-id",
    cwd: "/home/vincent/src/home",
    project: "home",
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
    models: new Map([["claude-opus-4-6@google-vertex-claude", { calls: 5, tokens: 230, cost: 0.05 }]]),
    ...overrides,
  };
}

describe("buildDashboardData", () => {
  const sessions = [
    makeSession({ id: "s1", startTime: new Date("2026-02-10T10:00:00Z") }),
    makeSession({ id: "s2", startTime: new Date("2026-02-11T14:00:00Z"), cost: 0.10 }),
  ];

  it("produces data for multiple periods", () => {
    const data = buildDashboardData(sessions);
    expect(data.periods).toHaveProperty("week");
    expect(data.periods).toHaveProperty("month");
    expect(data.periods).toHaveProperty("all");
  });

  it("each period has summary, tools, models, trends", () => {
    const data = buildDashboardData(sessions);
    const week = data.periods["week"];
    expect(week).toBeDefined();
    expect(week.summary).toBeDefined();
    expect(week.tools).toBeDefined();
    expect(week.models).toBeDefined();
    expect(week.trends).toBeDefined();
  });

  it("includes heatmap data across all periods", () => {
    const data = buildDashboardData(sessions);
    expect(data.heatmap.length).toBeGreaterThan(0);
    expect(data.heatmap[0]).toHaveProperty("date");
    expect(data.heatmap[0]).toHaveProperty("value");
  });

  it("includes projects list", () => {
    const data = buildDashboardData(sessions);
    const all = data.periods["all"];
    expect(all.projects.length).toBeGreaterThan(0);
    expect(all.projects[0]).toHaveProperty("label");
    expect(all.projects[0]).toHaveProperty("sessions");
  });
});

describe("generateHtml", () => {
  const sessions = [
    makeSession({ id: "s1" }),
    makeSession({ id: "s2", cost: 0.10 }),
  ];

  it("produces a complete HTML document", () => {
    const html = generateHtml(sessions);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("radian");
  });

  it("contains CSS with dark mode support", () => {
    const html = generateHtml(sessions);
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain(":root");
  });

  it("contains summary cards", () => {
    const html = generateHtml(sessions);
    expect(html).toContain("Sessions");
    expect(html).toContain("Tokens");
    expect(html).toContain("Tool Calls");
  });

  it("contains chart sections", () => {
    const html = generateHtml(sessions);
    expect(html).toContain("<svg");
    expect(html).toContain("Token Usage");
    expect(html).toContain("Models");
  });

  it("embeds data as JSON for client-side switching", () => {
    const html = generateHtml(sessions);
    expect(html).toContain("RADIAN_DATA");
    expect(html).toContain("<script>");
  });

  it("hides cost when all zero", () => {
    const zeroCostSessions = [
      makeSession({ id: "s1", cost: 0 }),
      makeSession({ id: "s2", cost: 0 }),
    ];
    const html = generateHtml(zeroCostSessions);
    // Cost card should not appear
    expect(html).not.toContain('class="card-label">Cost');
  });

  it("shows cost when non-zero", () => {
    const html = generateHtml(sessions);
    expect(html).toContain("Cost");
  });

  it("has sortable table headers", () => {
    const html = generateHtml(sessions);
    // Headers should have onclick for sorting
    expect(html).toContain("onclick=\"sortTable");
    // Sort indicators
    expect(html).toContain("sort-indicator");
    // Tables should have data-sortable attribute
    expect(html).toContain("data-sortable");
  });

  it("tool table headers are sortable", () => {
    const html = generateHtml(sessions);
    // Tool table should have sortable Calls, Errors, Sess% columns
    expect(html).toMatch(/onclick="sortTable\(this,[^)]*\)"/);
  });

  it("is self-contained (no external resources)", () => {
    const html = generateHtml(sessions);
    // No external CSS/JS/fonts (footer link to github is fine)
    expect(html).not.toMatch(/src="http/);
    expect(html).not.toContain("@import");
    expect(html).not.toMatch(/link.*rel="stylesheet".*href="http/);
  });
});
