/**
 * Tool inventory discovery and audit.
 * Scans pi extensions to find registered tools, then compares
 * against actual usage to identify never/rarely-used tools.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const DEFAULT_EXTENSIONS_DIR = join(homedir(), ".pi", "agent", "extensions");

const BUILTIN_TOOLS = ["bash", "read", "edit", "write", "grep", "find", "ls"];

export interface RegisteredTool {
  name: string;
  extension: string;
}

export interface ToolAudit {
  /** Tools registered but never called in any session. */
  neverUsed: RegisteredTool[];
  /** Tools called fewer than 5 times total. */
  rarelyUsed: (RegisteredTool & { calls: number })[];
  /** All registered tools grouped by extension. */
  byExtension: Map<string, (RegisteredTool & { calls: number })[]>;
}

/** Discover all registered tools from pi extensions directory. */
export function discoverRegisteredTools(extensionsDir?: string): RegisteredTool[] {
  const tools: RegisteredTool[] = [];

  // Always include built-in tools
  for (const name of BUILTIN_TOOLS) {
    tools.push({ name, extension: "built-in" });
  }

  const dir = extensionsDir ?? DEFAULT_EXTENSIONS_DIR;
  if (!existsSync(dir)) return tools;

  for (const entry of readdirSync(dir)) {
    const entryPath = join(dir, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      // Extension directory — look for index.ts
      const indexPath = join(entryPath, "index.ts");
      if (existsSync(indexPath)) {
        const found = extractToolNames(indexPath);
        for (const name of found) {
          tools.push({ name, extension: entry });
        }
      }
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      // Top-level extension file
      const found = extractToolNames(entryPath);
      const extName = basename(entry, ".ts");
      for (const name of found) {
        tools.push({ name, extension: extName });
      }
    }
  }

  return tools;
}

/** Extract tool names from a TypeScript extension file by pattern matching. */
function extractToolNames(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const names: string[] = [];

    // Match: name: "tool_name" patterns in addTool calls
    const regex = /name:\s*["']([a-zA-Z_][a-zA-Z0-9_]*)["']/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      names.push(match[1]);
    }

    return names;
  } catch {
    return [];
  }
}

/** Build a tool audit comparing registered tools against actual usage. */
export function buildToolAudit(
  registered: RegisteredTool[],
  calledTools: Map<string, { calls: number; lastUsed: Date | null }>,
): ToolAudit {
  const RARELY_THRESHOLD = 5;

  const neverUsed: RegisteredTool[] = [];
  const rarelyUsed: (RegisteredTool & { calls: number })[] = [];
  const byExtension = new Map<string, (RegisteredTool & { calls: number })[]>();

  for (const tool of registered) {
    const usage = calledTools.get(tool.name);
    const calls = usage?.calls ?? 0;

    // Classify
    if (calls === 0) {
      neverUsed.push(tool);
    } else if (calls < RARELY_THRESHOLD) {
      rarelyUsed.push({ ...tool, calls });
    }

    // Group by extension
    const extTools = byExtension.get(tool.extension) ?? [];
    extTools.push({ ...tool, calls });
    byExtension.set(tool.extension, extTools);
  }

  return { neverUsed, rarelyUsed, byExtension };
}
