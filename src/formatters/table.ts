/**
 * Terminal table formatter.
 * Hand-rolled, no dependencies.
 */

import type { AggregatedStats, ToolStats } from "../types.js";
import { topBy } from "../aggregator.js";
import type { ToolAudit } from "../inventory.js";
import {
  formatNum,
  formatDuration,
  formatPct,
  formatRelativeTime,
  padRight,
  padLeft,
  bar,
} from "../utils.js";

const BUILTIN_TOOL_NAMES = new Set(["bash", "read", "edit", "write", "grep", "find", "ls"]);
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** Classify tools into built-in and extension categories. */
export function classifyTools(tools: Map<string, ToolStats>): { builtIn: ToolStats[]; extension: ToolStats[] } {
  const builtIn: ToolStats[] = [];
  const extension: ToolStats[] = [];

  for (const tool of tools.values()) {
    if (BUILTIN_TOOL_NAMES.has(tool.name)) {
      builtIn.push(tool);
    } else {
      extension.push(tool);
    }
  }

  builtIn.sort((a, b) => b.calls - a.calls);
  extension.sort((a, b) => b.calls - a.calls);

  return { builtIn, extension };
}

/** Print the summary overview. */
export function printSummary(stats: AggregatedStats): void {
  const { period } = stats;
  console.log(`\n  radian — ${period.label}\n`);
  console.log(`  ${"─".repeat(60)}`);

  console.log(`  Sessions          ${padLeft(formatNum(stats.totalSessions), 10)}`);
  console.log(`  Messages          ${padLeft(formatNum(stats.totalMessages), 10)}    (user: ${formatNum(stats.totalUserMessages)}, assistant: ${formatNum(stats.totalAssistantMessages)})`);
  console.log(`  Tool calls        ${padLeft(formatNum(stats.totalToolCalls), 10)}    (errors: ${formatNum(stats.totalToolErrors)}, rate: ${formatPct(stats.totalToolErrors, stats.totalToolCalls)})`);
  console.log(`  Tokens            ${padLeft(formatNum(stats.totalTokens.total), 10)}    (in: ${formatNum(stats.totalTokens.input)}, out: ${formatNum(stats.totalTokens.output)}, cache: ${formatNum(stats.totalTokens.cacheRead)})`);

  if (stats.totalCost > 0) {
    console.log(`  Cost              ${padLeft(`$${stats.totalCost.toFixed(2)}`, 10)}`);
  }

  // Averages
  if (stats.totalSessions > 0) {
    const avgMessages = Math.round(stats.totalMessages / stats.totalSessions);
    const avgDuration = stats.sessions.reduce((sum, s) => sum + s.duration, 0) / stats.totalSessions;
    const avgToolCalls = Math.round(stats.totalToolCalls / stats.totalSessions);
    console.log(`\n  Avg/session       messages: ${avgMessages}, tools: ${avgToolCalls}, duration: ${formatDuration(avgDuration)}`);
  }

  // Top items
  const topTool = topBy(stats.tools, "calls");
  const topModel = topBy(stats.models, "calls");
  const topProject = topBy(stats.projects, "sessions");

  if (topTool) console.log(`  Most used tool    ${topTool[0]} (${formatNum(topTool[1].calls)} calls)`);
  if (topModel) console.log(`  Most used model   ${topModel[1].model} (${formatNum(topModel[1].calls)} calls)`);
  if (topProject) console.log(`  Most active proj  ${topProject[0]} (${topProject[1].sessions} sessions)`);

  console.log();
}

/** Print a tool row. */
function printToolRow(
  tool: ToolStats,
  nameWidth: number,
  totalSessions: number,
  dim: boolean,
): void {
  const errorPct = formatPct(tool.errors, tool.calls);
  const sessCount = tool.sessionIds.size;
  const sessPct = formatPct(sessCount, totalSessions);
  const lastUsed = formatRelativeTime(tool.lastUsed);

  const line = `  ${padRight(tool.name, nameWidth)}  ${padLeft(formatNum(tool.calls), 7)}  ${padLeft(formatNum(tool.errors), 7)}  ${padLeft(errorPct, 7)}  ${padLeft(String(sessCount), 8)}  ${padLeft(sessPct, 6)}  ${lastUsed}`;
  console.log(dim ? `${DIM}${line}${RESET}` : line);
}

/** Print the tool usage breakdown table. */
export function printTools(stats: AggregatedStats, limit: number = 20): void {
  const { period } = stats;
  const { builtIn, extension } = classifyTools(stats.tools);

  if (builtIn.length === 0 && extension.length === 0) {
    console.log(`\n  Tool Usage — ${period.label}\n`);
    console.log("  No tool calls in this period.\n");
    return;
  }

  // Compute sessions that used at least one extension tool
  const extSessionIds = new Set<string>();
  for (const tool of extension) {
    for (const id of tool.sessionIds) extSessionIds.add(id);
  }
  const extSessions = extSessionIds.size;

  const allTools = [...builtIn, ...extension];
  const nameWidth = Math.max(4, ...allTools.map((t) => t.name.length));

  // Header
  const header = `  ${padRight("Tool", nameWidth)}  ${padLeft("Calls", 7)}  ${padLeft("Errors", 7)}  ${padLeft("Error%", 7)}  ${padLeft("Sessions", 8)}  ${padLeft("Sess%", 6)}  Last Used`;

  // Extension tools first (these are the interesting ones)
  if (extension.length > 0) {
    const extShowing = extension.length > limit ? ` (showing ${limit} of ${extension.length})` : "";
    console.log(`\n  Extension Tools — ${period.label}${extShowing}  (Sess%: of ${extSessions} sessions using extensions)\n`);
    console.log(header);
    console.log(`  ${"─".repeat(header.length - 2)}`);

    for (const tool of extension.slice(0, limit)) {
      printToolRow(tool, nameWidth, extSessions, false);
    }
  }

  // Built-in tools (dimmed, always shown)
  if (builtIn.length > 0) {
    console.log(`\n  ${DIM}Core Tools — ${period.label}  (Sess%: of ${stats.totalSessions} total sessions)${RESET}\n`);
    console.log(`${DIM}${header}${RESET}`);
    console.log(`${DIM}  ${"─".repeat(header.length - 2)}${RESET}`);

    for (const tool of builtIn) {
      printToolRow(tool, nameWidth, stats.totalSessions, true);
    }
  }

  console.log();
}

/** Print the tool audit section. */
export function printToolAudit(audit: ToolAudit): void {
  console.log("  Tool Audit:\n");

  // Never used
  if (audit.neverUsed.length > 0) {
    console.log("  🔴 Never used (registered but 0 calls across all sessions):");
    for (const tool of audit.neverUsed) {
      console.log(`     ${padRight(tool.name, 25)} (ext: ${tool.extension})`);
    }
  } else {
    console.log("  🔴 Never used: (none — all registered tools have been called)");
  }

  // Rarely used
  if (audit.rarelyUsed.length > 0) {
    console.log("\n  🟡 Rarely used (< 5 calls total):");
    for (const tool of audit.rarelyUsed) {
      const label = tool.calls === 1 ? "call" : "calls";
      console.log(`     ${padRight(tool.name, 25)} ${tool.calls} ${label}${padLeft(`(ext: ${tool.extension})`, 25)}`);
    }
  }

  // By extension
  console.log("\n  By extension:");
  const extensions = [...audit.byExtension.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [ext, tools] of extensions) {
    const toolList = tools
      .sort((a, b) => b.calls - a.calls)
      .map((t) => `${t.name} (${formatNum(t.calls)})`)
      .join(", ");
    const label = tools.length === 1 ? "tool" : "tools";
    console.log(`     ${padRight(ext, 20)} ${tools.length} ${label}:  ${toolList}`);
  }

  console.log();
}

/** Print the models breakdown table. */
export function printModels(stats: AggregatedStats, limit: number = 20): void {
  const { period } = stats;
  console.log(`\n  Models — ${period.label}\n`);

  const models = [...stats.models.values()].sort((a, b) => b.calls - a.calls).slice(0, limit);

  if (models.length === 0) {
    console.log("  No model usage in this period.\n");
    return;
  }

  const nameWidth = Math.max(5, ...models.map((m) => m.model.length));
  const provWidth = Math.max(8, ...models.map((m) => m.provider.length));
  const hasCost = models.some((m) => m.cost > 0);

  let header = `  ${padRight("Model", nameWidth)}  ${padRight("Provider", provWidth)}  ${padLeft("Calls", 7)}  ${padLeft("Tokens", 10)}`;
  if (hasCost) header += `  ${padLeft("Cost", 8)}`;
  console.log(header);
  console.log(`  ${"─".repeat(header.length - 2)}`);

  for (const model of models) {
    let line = `  ${padRight(model.model, nameWidth)}  ${padRight(model.provider, provWidth)}  ${padLeft(formatNum(model.calls), 7)}  ${padLeft(formatNum(model.tokens.total), 10)}`;
    if (hasCost) line += `  ${padLeft(`$${model.cost.toFixed(2)}`, 8)}`;
    console.log(line);
  }

  console.log();
}

/** Print the projects breakdown table. */
export function printProjects(stats: AggregatedStats, limit: number = 20): void {
  const { period } = stats;
  console.log(`\n  Projects — ${period.label}\n`);

  const projects = [...stats.projects.entries()]
    .sort(([, a], [, b]) => b.sessions - a.sessions)
    .slice(0, limit);

  if (projects.length === 0) {
    console.log("  No sessions in this period.\n");
    return;
  }

  const nameWidth = Math.max(7, ...projects.map(([name]) => name.length));

  const header = `  ${padRight("Project", nameWidth)}  ${padLeft("Sessions", 8)}  ${padLeft("Messages", 8)}  ${padLeft("Tools", 7)}  ${padLeft("Tokens", 10)}`;
  console.log(header);
  console.log(`  ${"─".repeat(header.length - 2)}`);

  for (const [name, data] of projects) {
    console.log(
      `  ${padRight(name, nameWidth)}  ${padLeft(String(data.sessions), 8)}  ${padLeft(formatNum(data.messages), 8)}  ${padLeft(formatNum(data.toolCalls), 7)}  ${padLeft(formatNum(data.tokens), 10)}`
    );
  }

  console.log();
}

/** Print session details table. */
export function printSessions(stats: AggregatedStats, limit: number = 20): void {
  const { period } = stats;
  const allSessions = [...stats.sessions]
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  const total = allSessions.length;
  const sessions = allSessions.slice(0, limit);
  const showing = total > limit ? ` (showing ${limit} of ${total})` : "";
  console.log(`\n  Sessions — ${period.label}${showing}\n`);

  if (sessions.length === 0) {
    console.log("  No sessions in this period.\n");
    return;
  }

  const projWidth = Math.max(7, ...sessions.map((s) => s.project.length));

  const header = `  ${padRight("Date", 16)}  ${padRight("Project", projWidth)}  ${padLeft("Msgs", 6)}  ${padLeft("Tools", 6)}  ${padLeft("Tokens", 8)}  ${padLeft("Duration", 10)}`;
  console.log(header);
  console.log(`  ${"─".repeat(header.length - 2)}`);

  for (const s of sessions) {
    const date = s.startTime.toLocaleString("en-CA", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    console.log(
      `  ${padRight(date, 16)}  ${padRight(s.project, projWidth)}  ${padLeft(String(s.messageCount), 6)}  ${padLeft(String(s.toolCalls), 6)}  ${padLeft(formatNum(s.tokens.total), 8)}  ${padLeft(formatDuration(s.duration), 10)}`
    );
  }

  console.log();
}
