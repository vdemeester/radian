import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverRegisteredTools, buildToolAudit, type RegisteredTool } from "./inventory.js";

function makeExtensionDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "radian-ext-"));
  return dir;
}

describe("discoverRegisteredTools", () => {
  let extDir: string;

  beforeEach(() => {
    extDir = makeExtensionDir();
  });

  afterEach(() => {
    rmSync(extDir, { recursive: true, force: true });
  });

  it("discovers tools from extension index.ts files", () => {
    const githubDir = join(extDir, "github");
    mkdirSync(githubDir);
    writeFileSync(join(githubDir, "index.ts"), `
      export default (ctx) => {
        ctx.addTool({
          name: "github",
          description: "Manage GitHub PRs",
          parameters: {},
          execute: async () => {},
        });
      };
    `);

    const tools = discoverRegisteredTools(extDir);
    const extTools = tools.filter(t => t.extension !== "built-in");
    expect(extTools.length).toBe(1);
    expect(extTools[0].name).toBe("github");
    expect(extTools[0].extension).toBe("github");
  });

  it("discovers tools from top-level .ts files", () => {
    writeFileSync(join(extDir, "my-tool.ts"), `
      ctx.addTool({
        name: "my_tool",
        description: "A custom tool",
      });
    `);

    const tools = discoverRegisteredTools(extDir);
    const extTools = tools.filter(t => t.extension !== "built-in");
    expect(extTools.length).toBe(1);
    expect(extTools[0].name).toBe("my_tool");
    expect(extTools[0].extension).toBe("my-tool");
  });

  it("discovers multiple tools from one extension", () => {
    const searchDir = join(extDir, "search");
    mkdirSync(searchDir);
    writeFileSync(join(searchDir, "index.ts"), `
      ctx.addTool({ name: "web_search", description: "Search the web" });
      ctx.addTool({ name: "github_search", description: "Search GitHub" });
      ctx.addTool({ name: "stack_overflow_search", description: "Search SO" });
    `);

    const tools = discoverRegisteredTools(extDir);
    const extTools = tools.filter(t => t.extension !== "built-in");
    expect(extTools.length).toBe(3);
    expect(extTools.map(t => t.name).sort()).toEqual(["github_search", "stack_overflow_search", "web_search"]);
    expect(extTools.every(t => t.extension === "search")).toBe(true);
  });

  it("ignores node_modules", () => {
    const nmDir = join(extDir, "my-ext", "node_modules", "dep");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "index.ts"), `ctx.addTool({ name: "hidden" });`);

    const tools = discoverRegisteredTools(extDir);
    const extTools = tools.filter(t => t.extension !== "built-in");
    expect(extTools.length).toBe(0);
  });

  it("includes built-in tools", () => {
    const tools = discoverRegisteredTools(extDir);
    // Even with empty extensions dir, built-ins should be present
    const builtinNames = tools.filter(t => t.extension === "built-in").map(t => t.name);
    expect(builtinNames).toContain("bash");
    expect(builtinNames).toContain("read");
    expect(builtinNames).toContain("edit");
    expect(builtinNames).toContain("write");
  });

  it("returns empty for nonexistent directory", () => {
    const tools = discoverRegisteredTools("/nonexistent/path");
    // Should still have built-ins
    const builtinNames = tools.filter(t => t.extension === "built-in").map(t => t.name);
    expect(builtinNames).toContain("bash");
  });
});

describe("buildToolAudit", () => {
  const registered: RegisteredTool[] = [
    { name: "bash", extension: "built-in" },
    { name: "read", extension: "built-in" },
    { name: "edit", extension: "built-in" },
    { name: "write", extension: "built-in" },
    { name: "github", extension: "github" },
    { name: "jira", extension: "jira" },
    { name: "web_search", extension: "search" },
    { name: "never_used_tool", extension: "unused-ext" },
  ];

  const calledTools = new Map<string, { calls: number; lastUsed: Date | null }>([
    ["bash", { calls: 1000, lastUsed: new Date("2026-02-11") }],
    ["read", { calls: 500, lastUsed: new Date("2026-02-11") }],
    ["edit", { calls: 200, lastUsed: new Date("2026-02-10") }],
    ["write", { calls: 100, lastUsed: new Date("2026-02-09") }],
    ["github", { calls: 10, lastUsed: new Date("2026-02-05") }],
    ["jira", { calls: 2, lastUsed: new Date("2026-01-28") }],
    ["web_search", { calls: 50, lastUsed: new Date("2026-02-11") }],
  ]);

  it("identifies never-used tools", () => {
    const audit = buildToolAudit(registered, calledTools);
    expect(audit.neverUsed.map(t => t.name)).toEqual(["never_used_tool"]);
    expect(audit.neverUsed[0].extension).toBe("unused-ext");
  });

  it("identifies rarely-used tools (< 5 calls)", () => {
    const audit = buildToolAudit(registered, calledTools);
    expect(audit.rarelyUsed.map(t => t.name)).toContain("jira");
  });

  it("groups tools by extension", () => {
    const audit = buildToolAudit(registered, calledTools);
    expect(audit.byExtension.get("built-in")!.length).toBe(4);
    expect(audit.byExtension.get("search")!.length).toBe(1);
    expect(audit.byExtension.get("unused-ext")!.length).toBe(1);
  });

  it("handles tools called but not registered (dynamic tools)", () => {
    const extraCalled = new Map(calledTools);
    extraCalled.set("unknown_tool", { calls: 5, lastUsed: new Date() });

    const audit = buildToolAudit(registered, extraCalled);
    // Should not crash, unknown tools just aren't in the audit
    expect(audit.neverUsed.map(t => t.name)).toEqual(["never_used_tool"]);
  });
});
