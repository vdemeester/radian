/**
 * JSON output formatter.
 * Converts aggregated stats to serializable JSON.
 */

import type { AggregatedStats } from "../types.js";

export interface JsonDisplayOptions {
  showCost?: boolean;
}

/** Convert stats to a JSON-serializable object and print to stdout. */
export function printJson(stats: AggregatedStats, command: string, opts: JsonDisplayOptions = {}): void {
  const output = toJsonObject(stats, command, opts);
  console.log(JSON.stringify(output, null, 2));
}

function toJsonObject(stats: AggregatedStats, command: string, opts: JsonDisplayOptions = {}): Record<string, unknown> {
  const base = {
    period: {
      label: stats.period.label,
      from: stats.period.from.toISOString(),
      to: stats.period.to.toISOString(),
    },
  };

  switch (command) {
    case "summary": {
      const summary: Record<string, unknown> = {
        ...base,
        sessions: stats.totalSessions,
        messages: {
          total: stats.totalMessages,
          user: stats.totalUserMessages,
          assistant: stats.totalAssistantMessages,
        },
        toolCalls: stats.totalToolCalls,
        toolErrors: stats.totalToolErrors,
        tokens: stats.totalTokens,
      };
      if (opts.showCost) summary.cost = stats.totalCost;
      return summary;
    }

    case "tools":
      return {
        ...base,
        tools: [...stats.tools.values()].map((t) => ({
          name: t.name,
          calls: t.calls,
          errors: t.errors,
          errorRate: t.calls > 0 ? t.errors / t.calls : 0,
          sessions: t.sessionIds.size,
          sessionRate: stats.totalSessions > 0 ? t.sessionIds.size / stats.totalSessions : 0,
          lastUsed: t.lastUsed?.toISOString() ?? null,
          extension: t.extension ?? null,
        })).sort((a, b) => b.calls - a.calls),
      };

    case "models":
      return {
        ...base,
        models: [...stats.models.values()].map((m) => {
          const entry: Record<string, unknown> = {
            model: m.model,
            provider: m.provider,
            calls: m.calls,
            tokens: m.tokens,
          };
          if (opts.showCost) entry.cost = m.cost;
          return entry;
        }).sort((a, b) => (b.calls as number) - (a.calls as number)),
      };

    case "projects":
      return {
        ...base,
        projects: [...stats.projects.entries()].map(([name, data]) => ({
          name,
          ...data,
        })).sort((a, b) => b.sessions - a.sessions),
      };

    case "sessions":
      return {
        ...base,
        sessions: stats.sessions.map((s) => {
          const entry: Record<string, unknown> = {
            id: s.id,
            project: s.project,
            startTime: s.startTime.toISOString(),
            endTime: s.endTime.toISOString(),
            duration: s.duration,
            messages: s.messageCount,
            userMessages: s.userMessages,
            assistantMessages: s.assistantMessages,
            toolCalls: s.toolCalls,
            toolErrors: s.toolErrors,
            tokens: s.tokens,
          };
          if (opts.showCost) entry.cost = s.cost;
          return entry;
        }).sort((a, b) => new Date(b.startTime as string).getTime() - new Date(a.startTime as string).getTime()),
      };

    default:
      return { ...base, error: `Unknown command: ${command}` };
  }
}
