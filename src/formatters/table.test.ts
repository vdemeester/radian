import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AggregatedStats, ToolStats } from "../types.js";
import { classifyTools } from "./table.js";

function makeToolStats(name: string, calls: number, sessions: number, errors: number = 0): ToolStats {
  const ids = new Set<string>();
  for (let i = 0; i < sessions; i++) ids.add(`s${i}`);
  return {
    name,
    calls,
    errors,
    sessionIds: ids,
    lastUsed: new Date("2026-02-11"),
  };
}

describe("classifyTools", () => {
  it("separates built-in and extension tools", () => {
    const tools = new Map<string, ToolStats>([
      ["bash", makeToolStats("bash", 1000, 50)],
      ["read", makeToolStats("read", 500, 40)],
      ["edit", makeToolStats("edit", 200, 30)],
      ["write", makeToolStats("write", 100, 20)],
      ["github", makeToolStats("github", 10, 5)],
      ["org_todo", makeToolStats("org_todo", 50, 15)],
    ]);

    const { builtIn, extension } = classifyTools(tools);
    expect(builtIn.map((t) => t.name)).toEqual(["bash", "read", "edit", "write"]);
    expect(extension.map((t) => t.name)).toEqual(["org_todo", "github"]);
  });

  it("sorts extension tools by calls descending", () => {
    const tools = new Map<string, ToolStats>([
      ["bash", makeToolStats("bash", 1000, 50)],
      ["github", makeToolStats("github", 10, 5)],
      ["org_todo", makeToolStats("org_todo", 50, 15)],
      ["web_search", makeToolStats("web_search", 30, 10)],
    ]);

    const { extension } = classifyTools(tools);
    expect(extension.map((t) => t.name)).toEqual(["org_todo", "web_search", "github"]);
  });

  it("sorts built-in tools by calls descending", () => {
    const tools = new Map<string, ToolStats>([
      ["write", makeToolStats("write", 100, 20)],
      ["bash", makeToolStats("bash", 1000, 50)],
      ["read", makeToolStats("read", 500, 40)],
      ["edit", makeToolStats("edit", 200, 30)],
    ]);

    const { builtIn } = classifyTools(tools);
    expect(builtIn.map((t) => t.name)).toEqual(["bash", "read", "edit", "write"]);
  });

  it("handles grep/find/ls as built-in", () => {
    const tools = new Map<string, ToolStats>([
      ["bash", makeToolStats("bash", 100, 10)],
      ["grep", makeToolStats("grep", 5, 3)],
      ["find", makeToolStats("find", 2, 1)],
      ["ls", makeToolStats("ls", 1, 1)],
    ]);

    const { builtIn, extension } = classifyTools(tools);
    expect(builtIn.length).toBe(4);
    expect(extension.length).toBe(0);
  });

  it("returns empty arrays when no tools", () => {
    const { builtIn, extension } = classifyTools(new Map());
    expect(builtIn.length).toBe(0);
    expect(extension.length).toBe(0);
  });
});
