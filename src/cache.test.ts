import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Cache } from "./cache.js";
import type { SessionStats } from "./types.js";

function makeCacheDir(): string {
  return mkdtempSync(join(tmpdir(), "radian-cache-test-"));
}

function makeSessionFile(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

function makeFakeStats(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    id: "test",
    cwd: "/test",
    project: "test",
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
    tools: new Map([["bash", { calls: 3, errors: 0 }]]),
    models: new Map([["claude@copilot", { calls: 5, tokens: 230, cost: 0.05 }]]),
    ...overrides,
  };
}

describe("Cache", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = makeCacheDir();
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("returns null for uncached session", () => {
    const cache = new Cache(cacheDir);
    const result = cache.get("/nonexistent/session.jsonl", 0);
    expect(result).toBeNull();
  });

  it("stores and retrieves cached stats", () => {
    const cache = new Cache(cacheDir);
    const stats = makeFakeStats({ id: "cached-1" });
    cache.set("/some/session.jsonl", 1000, stats);

    const result = cache.get("/some/session.jsonl", 1000);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("cached-1");
  });

  it("invalidates cache when mtime changes", () => {
    const cache = new Cache(cacheDir);
    const stats = makeFakeStats();
    cache.set("/some/session.jsonl", 1000, stats);

    // Same mtime → hit
    expect(cache.get("/some/session.jsonl", 1000)).not.toBeNull();
    // Different mtime → miss
    expect(cache.get("/some/session.jsonl", 2000)).toBeNull();
  });

  it("preserves Map fields through serialization", () => {
    const cache = new Cache(cacheDir);
    const stats = makeFakeStats({
      tools: new Map([["bash", { calls: 5, errors: 1 }], ["read", { calls: 3, errors: 0 }]]),
      models: new Map([["claude@copilot", { calls: 3, tokens: 100, cost: 0.01 }]]),
    });
    cache.set("/some/session.jsonl", 1000, stats);

    const result = cache.get("/some/session.jsonl", 1000);
    expect(result!.tools).toBeInstanceOf(Map);
    expect(result!.tools.get("bash")).toEqual({ calls: 5, errors: 1 });
    expect(result!.models).toBeInstanceOf(Map);
    expect(result!.models.get("claude@copilot")).toEqual({ calls: 3, tokens: 100, cost: 0.01 });
  });

  it("preserves Date fields through serialization", () => {
    const cache = new Cache(cacheDir);
    const stats = makeFakeStats({
      startTime: new Date("2026-02-10T10:00:00Z"),
      endTime: new Date("2026-02-10T10:30:00Z"),
    });
    cache.set("/some/session.jsonl", 1000, stats);

    const result = cache.get("/some/session.jsonl", 1000);
    expect(result!.startTime).toBeInstanceOf(Date);
    expect(result!.startTime.toISOString()).toBe("2026-02-10T10:00:00.000Z");
    expect(result!.endTime).toBeInstanceOf(Date);
  });

  it("handles concurrent keys without collision", () => {
    const cache = new Cache(cacheDir);
    const stats1 = makeFakeStats({ id: "session-1" });
    const stats2 = makeFakeStats({ id: "session-2" });

    cache.set("/path/a.jsonl", 1000, stats1);
    cache.set("/path/b.jsonl", 2000, stats2);

    expect(cache.get("/path/a.jsonl", 1000)!.id).toBe("session-1");
    expect(cache.get("/path/b.jsonl", 2000)!.id).toBe("session-2");
  });

  it("survives corrupt cache files gracefully", () => {
    const cache = new Cache(cacheDir);
    // Write garbage to a cache file
    const cacheFile = join(cacheDir, "v1", "corrupted.json");
    mkdirSync(join(cacheDir, "v1"), { recursive: true });
    writeFileSync(cacheFile, "not json{{{");

    // Should not throw, just return null
    const result = cache.get("/some/session.jsonl", 1000);
    expect(result).toBeNull();
  });
});
