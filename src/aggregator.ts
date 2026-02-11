/**
 * Stats aggregation engine.
 * Takes filtered SessionStats[] and produces AggregatedStats.
 */

import type { AggregatedStats, FilterOptions, ModelStats, SessionStats, ToolStats } from "./types.js";
import { getFilterLabel, periodToRange } from "./filters.js";
import { splitModelKey } from "./utils.js";

/** Aggregate multiple session stats into a single summary. */
export function aggregate(sessions: SessionStats[], filterOpts: FilterOptions): AggregatedStats {
  let range: { from: Date; to: Date };
  if (filterOpts.from || filterOpts.to) {
    range = {
      from: filterOpts.from ?? new Date(0),
      to: filterOpts.to ?? new Date(),
    };
  } else {
    range = periodToRange(filterOpts.period);
  }

  const stats: AggregatedStats = {
    period: { from: range.from, to: range.to, label: getFilterLabel(filterOpts) },
    sessions,
    totalSessions: sessions.length,
    totalMessages: 0,
    totalUserMessages: 0,
    totalAssistantMessages: 0,
    totalToolCalls: 0,
    totalToolErrors: 0,
    totalTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    totalCost: 0,
    tools: new Map(),
    models: new Map(),
    projects: new Map(),
  };

  for (const session of sessions) {
    stats.totalMessages += session.messageCount;
    stats.totalUserMessages += session.userMessages;
    stats.totalAssistantMessages += session.assistantMessages;
    stats.totalToolCalls += session.toolCalls;
    stats.totalToolErrors += session.toolErrors;

    stats.totalTokens.input += session.tokens.input;
    stats.totalTokens.output += session.tokens.output;
    stats.totalTokens.cacheRead += session.tokens.cacheRead;
    stats.totalTokens.cacheWrite += session.tokens.cacheWrite;
    stats.totalTokens.total += session.tokens.total;
    stats.totalCost += session.cost;

    // Aggregate tools
    for (const [toolName, toolData] of session.tools) {
      const existing = stats.tools.get(toolName);
      if (existing) {
        existing.calls += toolData.calls;
        existing.errors += toolData.errors;
        existing.sessionIds.add(session.id);
        if (session.endTime && (!existing.lastUsed || session.endTime > existing.lastUsed)) {
          existing.lastUsed = session.endTime;
        }
      } else {
        const toolStats: ToolStats = {
          name: toolName,
          calls: toolData.calls,
          errors: toolData.errors,
          sessionIds: new Set([session.id]),
          lastUsed: session.endTime,
        };
        stats.tools.set(toolName, toolStats);
      }
    }

    // Aggregate models
    for (const [modelKey, modelData] of session.models) {
      const [model, provider] = splitModelKey(modelKey);
      const existing = stats.models.get(modelKey);
      if (existing) {
        existing.calls += modelData.calls;
        existing.tokens.total += modelData.tokens;
        existing.cost += modelData.cost;
      } else {
        stats.models.set(modelKey, {
          model,
          provider,
          calls: modelData.calls,
          tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: modelData.tokens },
          cost: modelData.cost,
        });
      }
    }

    // Aggregate projects
    const projEntry = stats.projects.get(session.project) || {
      sessions: 0,
      messages: 0,
      toolCalls: 0,
      tokens: 0,
    };
    projEntry.sessions++;
    projEntry.messages += session.messageCount;
    projEntry.toolCalls += session.toolCalls;
    projEntry.tokens += session.tokens.total;
    stats.projects.set(session.project, projEntry);
  }

  return stats;
}

/** Find the top item by a numeric property in a Map. */
export function topBy<T>(map: Map<string, T>, key: keyof T): [string, T] | null {
  let top: [string, T] | null = null;
  for (const [name, val] of map) {
    if (!top || (val[key] as number) > (top[1][key] as number)) {
      top = [name, val];
    }
  }
  return top;
}
