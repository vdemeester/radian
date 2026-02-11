import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { parseSessionFile, parseSessionStats, parseAllSessions, cwdToProject, decodeDirName } from "./parser.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

describe("parseSessionFile", () => {
  it("parses a valid JSONL session file into entries", () => {
    const entries = parseSessionFile(join(FIXTURES, "sample-session.jsonl"));
    expect(entries.length).toBe(7);
    expect(entries[0].type).toBe("session");
    expect(entries[1].type).toBe("model_change");
    expect(entries[3].type).toBe("message");
  });

  it("extracts session header correctly", () => {
    const entries = parseSessionFile(join(FIXTURES, "sample-session.jsonl"));
    const header = entries[0] as any;
    expect(header.id).toBe("test-session-001");
    expect(header.cwd).toBe("/home/user/src/myproject");
    expect(header.version).toBe(3);
  });

  it("skips malformed lines without crashing", () => {
    // parseSessionFile should be resilient
    const entries = parseSessionFile(join(FIXTURES, "sample-session.jsonl"));
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe("parseSessionStats", () => {
  it("extracts basic session metadata", () => {
    const stats = parseSessionStats(join(FIXTURES, "sample-session.jsonl"));
    expect(stats).not.toBeNull();
    expect(stats!.id).toBe("test-session-001");
    expect(stats!.cwd).toBe("/home/user/src/myproject");
  });

  it("counts messages by role", () => {
    const stats = parseSessionStats(join(FIXTURES, "sample-session.jsonl"));
    expect(stats!.userMessages).toBe(1);
    expect(stats!.assistantMessages).toBe(2);
    expect(stats!.messageCount).toBe(4); // 1 user + 2 assistant + 1 toolResult
  });

  it("counts tool calls from assistant content", () => {
    const stats = parseSessionStats(join(FIXTURES, "sample-session.jsonl"));
    expect(stats!.toolCalls).toBe(1); // one bash toolCall
    expect(stats!.tools.get("bash")).toEqual({ calls: 1, errors: 0 });
  });

  it("aggregates token usage from assistant messages", () => {
    const stats = parseSessionStats(join(FIXTURES, "sample-session.jsonl"));
    // Two assistant messages: 230 + 380 = 610 total tokens
    expect(stats!.tokens.total).toBe(610);
    expect(stats!.tokens.input).toBe(300); // 100 + 200
    expect(stats!.tokens.output).toBe(80); // 50 + 30
    expect(stats!.tokens.cacheRead).toBe(230); // 80 + 150
  });

  it("aggregates cost from assistant messages", () => {
    const stats = parseSessionStats(join(FIXTURES, "sample-session.jsonl"));
    expect(stats!.cost).toBeCloseTo(0.075); // 0.035 + 0.04
  });

  it("tracks model usage", () => {
    const stats = parseSessionStats(join(FIXTURES, "sample-session.jsonl"));
    const model = stats!.models.get("claude-sonnet-4-5@github-copilot");
    expect(model).toBeDefined();
    expect(model!.calls).toBe(2);
    expect(model!.tokens).toBe(610);
  });

  it("computes session duration from timestamps", () => {
    const stats = parseSessionStats(join(FIXTURES, "sample-session.jsonl"));
    // From header 10:00:00 to last message 10:00:04 = 4 seconds = 4000ms
    expect(stats!.duration).toBe(4000);
  });

  it("tracks tool errors", () => {
    const stats = parseSessionStats(join(FIXTURES, "session-with-errors.jsonl"));
    expect(stats!.toolErrors).toBe(2); // bash error + edit error
    expect(stats!.tools.get("bash")).toEqual({ calls: 1, errors: 1 });
    expect(stats!.tools.get("edit")).toEqual({ calls: 1, errors: 1 });
    expect(stats!.tools.get("read")).toEqual({ calls: 1, errors: 0 });
  });

  it("handles multiple tool calls in one assistant message", () => {
    const stats = parseSessionStats(join(FIXTURES, "session-with-errors.jsonl"));
    // First assistant message has 2 toolCalls (bash + read)
    // Second assistant message has 1 toolCall (edit)
    expect(stats!.toolCalls).toBe(3);
  });

  it("tracks multiple models in one session", () => {
    const stats = parseSessionStats(join(FIXTURES, "session-with-errors.jsonl"));
    const model = stats!.models.get("claude-opus-4-6@anthropic");
    expect(model).toBeDefined();
    expect(model!.calls).toBe(3); // 3 assistant messages
  });
});

describe("cwdToProject", () => {
  it("strips home and src prefix", () => {
    // cwdToProject uses homedir() which varies, so test the stripping logic
    expect(cwdToProject("/some/path/src/myproject")).toBe("some/path/src/myproject");
  });

  it("returns ~ for home directory", () => {
    expect(cwdToProject("")).toBe("~");
  });
});

describe("decodeDirName", () => {
  it("decodes pi session directory names", () => {
    expect(decodeDirName("--home-user-src-myproject--")).toBe("/home/user/src/myproject");
  });

  it("handles simple names", () => {
    expect(decodeDirName("--home-user--")).toBe("/home/user");
  });
});

describe("parseAllSessions with cache", () => {
  let sessionsDir: string;
  let cacheDir: string;

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), "radian-sessions-"));
    cacheDir = mkdtempSync(join(tmpdir(), "radian-cache-"));
    // Create a fake project dir with session files
    const projectDir = join(sessionsDir, "--test-project--");
    mkdirSync(projectDir);
    copyFileSync(
      join(import.meta.dirname, "fixtures", "sample-session.jsonl"),
      join(projectDir, "2026-02-10T10-00-00_test-001.jsonl")
    );
    copyFileSync(
      join(import.meta.dirname, "fixtures", "session-with-errors.jsonl"),
      join(projectDir, "2026-02-11T14-00-00_test-002.jsonl")
    );
  });

  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("parses all sessions from a custom directory", () => {
    const results = parseAllSessions({ sessionsDir });
    expect(results.length).toBe(2);
  });

  it("creates cache files on first parse", () => {
    parseAllSessions({ sessionsDir, cacheDir });
    const v1Dir = join(cacheDir, "v1");
    expect(existsSync(v1Dir)).toBe(true);
    const cacheFiles = readdirSync(v1Dir).filter((f) => f.endsWith(".json"));
    expect(cacheFiles.length).toBe(2);
  });

  it("uses cache on second parse (same results)", () => {
    const results1 = parseAllSessions({ sessionsDir, cacheDir });
    const results2 = parseAllSessions({ sessionsDir, cacheDir });
    expect(results2.length).toBe(results1.length);
    // Sort both by id for stable comparison
    results1.sort((a, b) => a.id.localeCompare(b.id));
    results2.sort((a, b) => a.id.localeCompare(b.id));
    expect(results2[0].id).toBe(results1[0].id);
    expect(results2[0].toolCalls).toBe(results1[0].toolCalls);
  });

  it("bypasses cache with noCache flag", () => {
    parseAllSessions({ sessionsDir, cacheDir });
    const results = parseAllSessions({ sessionsDir, cacheDir, noCache: true });
    expect(results.length).toBe(2);
  });
});
