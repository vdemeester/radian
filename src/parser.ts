/**
 * JSONL session parser.
 * Scans pi session directories, parses files, and extracts typed entries.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type {
  FileEntry,
  SessionHeader,
  SessionMessageEntry,
  ModelChangeEntry,
  AgentMessage,
  AssistantMessage,
  ToolCall,
  ToolResultMessage,
  SessionStats,
} from "./types.js";

const DEFAULT_SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions");

export interface ParseOptions {
  sessionsDir?: string;
}

/** Discover all session JSONL files across all project directories. */
export function discoverSessionFiles(sessionsDir?: string): string[] {
  const dir = sessionsDir ?? DEFAULT_SESSIONS_DIR;
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const projectDir of readdirSync(dir)) {
    const projectPath = join(dir, projectDir);
    const stat = statSync(projectPath);
    if (!stat.isDirectory()) continue;

    for (const file of readdirSync(projectPath)) {
      if (file.endsWith(".jsonl")) {
        files.push(join(projectPath, file));
      }
    }
  }
  return files;
}

/** Parse a single JSONL session file into typed entries. */
export function parseSessionFile(filePath: string): FileEntry[] {
  const content = readFileSync(filePath, "utf-8");
  const entries: FileEntry[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as FileEntry);
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

/** Extract project name from session cwd. */
export function cwdToProject(cwd: string): string {
  const home = homedir();
  let rel = cwd.startsWith(home) ? cwd.slice(home.length) : cwd;
  // Strip common prefixes
  rel = rel.replace(/^\/src\//, "");
  rel = rel.replace(/^\//, "");
  return rel || "~";
}

/** Extract project name from encoded session directory name. */
export function decodeDirName(dirName: string): string {
  // Pi encodes cwds as --home-vincent-src-foo-- → /home/vincent/src/foo
  return dirName.replace(/^--/, "/").replace(/--$/, "").replace(/-/g, "/");
}

/** Parse a session file and produce aggregated SessionStats. */
export function parseSessionStats(filePath: string): SessionStats | null {
  const entries = parseSessionFile(filePath);
  if (entries.length === 0) return null;

  // Find header
  const header = entries.find((e) => e.type === "session") as SessionHeader | undefined;
  if (!header) return null;

  const cwd = header.cwd || decodeDirName(basename(filePath.replace(/\/[^/]+\.jsonl$/, "").replace(/.*\/sessions\//, "")));
  const project = cwdToProject(cwd);

  const stats: SessionStats = {
    id: header.id,
    cwd,
    project,
    startTime: new Date(header.timestamp),
    endTime: new Date(header.timestamp),
    duration: 0,
    messageCount: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolResults: 0,
    toolErrors: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
    tools: new Map(),
    models: new Map(),
  };

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msgEntry = entry as SessionMessageEntry;
    const msg = msgEntry.message;
    if (!msg || !msg.role) continue;

    // Track timestamps for duration
    const ts = msg.timestamp ? new Date(msg.timestamp) : new Date(msgEntry.timestamp);
    if (ts > stats.endTime) stats.endTime = ts;

    stats.messageCount++;

    switch (msg.role) {
      case "user":
        stats.userMessages++;
        break;

      case "assistant": {
        stats.assistantMessages++;
        const assistantMsg = msg as AssistantMessage;

        // Token usage
        if (assistantMsg.usage) {
          stats.tokens.input += assistantMsg.usage.input || 0;
          stats.tokens.output += assistantMsg.usage.output || 0;
          stats.tokens.cacheRead += assistantMsg.usage.cacheRead || 0;
          stats.tokens.cacheWrite += assistantMsg.usage.cacheWrite || 0;
          stats.tokens.total += assistantMsg.usage.totalTokens || 0;

          if (assistantMsg.usage.cost) {
            stats.cost += assistantMsg.usage.cost.total || 0;
          }
        }

        // Model tracking
        if (assistantMsg.model) {
          const modelKey = `${assistantMsg.model}@${assistantMsg.provider || "unknown"}`;
          const modelEntry = stats.models.get(modelKey) || { calls: 0, tokens: 0, cost: 0 };
          modelEntry.calls++;
          modelEntry.tokens += assistantMsg.usage?.totalTokens || 0;
          modelEntry.cost += assistantMsg.usage?.cost?.total || 0;
          stats.models.set(modelKey, modelEntry);
        }

        // Tool calls in assistant content
        if (Array.isArray(assistantMsg.content)) {
          for (const block of assistantMsg.content) {
            if (block && block.type === "toolCall") {
              const tc = block as ToolCall;
              stats.toolCalls++;
              const toolEntry = stats.tools.get(tc.name) || { calls: 0, errors: 0 };
              toolEntry.calls++;
              stats.tools.set(tc.name, toolEntry);
            }
          }
        }
        break;
      }

      case "toolResult": {
        stats.toolResults++;
        const toolResult = msg as ToolResultMessage;
        if (toolResult.isError) {
          stats.toolErrors++;
          // Increment error count on the tool
          const toolEntry = stats.tools.get(toolResult.toolName);
          if (toolEntry) {
            toolEntry.errors++;
          }
        }
        break;
      }

      case "bashExecution":
        // Tracked separately, not counted as tool calls
        break;
    }
  }

  stats.duration = stats.endTime.getTime() - stats.startTime.getTime();
  return stats;
}

/** Parse all sessions and return per-session stats. */
export function parseAllSessions(opts?: ParseOptions): SessionStats[] {
  const files = discoverSessionFiles(opts?.sessionsDir);
  const results: SessionStats[] = [];

  for (const file of files) {
    try {
      const stats = parseSessionStats(file);
      if (stats) results.push(stats);
    } catch {
      // Skip unparseable files
    }
  }

  return results;
}
