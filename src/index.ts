#!/usr/bin/env node

/**
 * radian — Analytics and usage insights for pi-coding-agent sessions.
 */

import { Command } from "commander";
import { parseAllSessions } from "./parser.js";
import { filterSessions, getFilterLabel } from "./filters.js";
import { aggregate } from "./aggregator.js";
import { printSummary, printTools, printToolAudit, printModels, printProjects, printSessions } from "./formatters/table.js";
import { printJson } from "./formatters/json.js";
import { printTrend } from "./formatters/trends.js";
import { generateHtml } from "./formatters/html.js";
import { discoverRegisteredTools, buildToolAudit } from "./inventory.js";
import { getBucketSize, buildTimeSeries, type TrendMetric, type BreakdownDimension } from "./trends.js";
import type { FilterOptions, PeriodName } from "./types.js";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";

const program = new Command();

program
  .name("radian")
  .description("Analytics and usage insights for pi-coding-agent sessions")
  .version("0.1.0");

// Shared options
function addCommonOptions(cmd: Command): Command {
  return cmd
    .option("-p, --period <period>", "Time period: today, week, month, quarter, year, all", "week")
    .option("--from <date>", "Start date (YYYY-MM-DD)")
    .option("--to <date>", "End date (YYYY-MM-DD)")
    .option("--project <path>", "Filter by project path (substring match)")
    .option("--exclude-project <path>", "Exclude projects by path (substring match, comma-separated or repeatable)", (val: string, acc: string[]) => { acc.push(...val.split(",")); return acc; }, [] as string[])
    .option("-f, --format <format>", "Output format: table, json", "table")
    .option("-l, --limit <n>", "Max rows in tables", "20")
    .option("--show-cost", "Show cost information (hidden by default)")
    .option("--sessions-dir <path>", "Override session directory")
    .option("--no-cache", "Bypass cache, force re-parse")
    .option("--cache-dir <path>", "Override cache directory")
    .option("--extensions-dir <path>", "Override extensions directory");
}

interface CommonOpts {
  period: PeriodName;
  from?: string;
  to?: string;
  project?: string;
  excludeProject?: string[];
  format: string;
  limit: string;
  showCost?: boolean;
  sessionsDir?: string;
  cache: boolean;
  cacheDir?: string;
  extensionsDir?: string;
}

function buildFilterOpts(opts: CommonOpts): FilterOptions {
  return {
    period: opts.period as PeriodName,
    from: opts.from ? new Date(opts.from) : undefined,
    to: opts.to ? new Date(opts.to) : undefined,
    project: opts.project,
    excludeProjects: opts.excludeProject,
  };
}

function loadSessions(opts: CommonOpts) {
  return parseAllSessions({
    sessionsDir: opts.sessionsDir,
    cacheDir: opts.cacheDir,
    noCache: !opts.cache,
  });
}

function loadAndAggregate(opts: CommonOpts) {
  const allSessions = loadSessions(opts);
  const filterOpts = buildFilterOpts(opts);
  const filtered = filterSessions(allSessions, filterOpts);
  return aggregate(filtered, filterOpts);
}

// summary (default)
addCommonOptions(
  program
    .command("summary", { isDefault: true })
    .description("Overview stats")
).action((opts: CommonOpts) => {
  const stats = loadAndAggregate(opts);
  if (opts.format === "json") {
    printJson(stats, "summary", { showCost: !!opts.showCost });
  } else {
    printSummary(stats, { showCost: !!opts.showCost });
  }
});

// tools
addCommonOptions(
  program
    .command("tools")
    .description("Tool usage breakdown & audit")
    .option("--audit", "Show tool audit (never/rarely used, extension breakdown)")
).action((opts: CommonOpts & { audit?: boolean }) => {
  const stats = loadAndAggregate(opts);
  if (opts.format === "json") {
    printJson(stats, "tools", { showCost: !!opts.showCost });
  } else {
    printTools(stats, parseInt(opts.limit));
    if (opts.audit) {
      const registered = discoverRegisteredTools(opts.extensionsDir);
      const calledTools = new Map<string, { calls: number; lastUsed: Date | null }>();
      for (const [name, tool] of stats.tools) {
        calledTools.set(name, { calls: tool.calls, lastUsed: tool.lastUsed });
      }
      const audit = buildToolAudit(registered, calledTools);
      printToolAudit(audit);
    }
  }
});

// models
addCommonOptions(
  program
    .command("models")
    .description("Model/provider usage & tokens")
).action((opts: CommonOpts) => {
  const stats = loadAndAggregate(opts);
  if (opts.format === "json") {
    printJson(stats, "models", { showCost: !!opts.showCost });
  } else {
    printModels(stats, parseInt(opts.limit), { showCost: !!opts.showCost });
  }
});

// projects
addCommonOptions(
  program
    .command("projects")
    .description("Per-project breakdown")
).action((opts: CommonOpts) => {
  const stats = loadAndAggregate(opts);
  if (opts.format === "json") {
    printJson(stats, "projects", { showCost: !!opts.showCost });
  } else {
    printProjects(stats, parseInt(opts.limit));
  }
});

// sessions
addCommonOptions(
  program
    .command("sessions")
    .description("Session details")
).action((opts: CommonOpts) => {
  const stats = loadAndAggregate(opts);
  if (opts.format === "json") {
    printJson(stats, "sessions", { showCost: !!opts.showCost });
  } else {
    printSessions(stats, parseInt(opts.limit));
  }
});

// trends
addCommonOptions(
  program
    .command("trends")
    .description("Usage evolution over time")
    .option("-m, --metric <metric>", "Metric: tokens, sessions, tool-calls, messages", "tokens")
    .option("-b, --by <dimension>", "Break down by: tool, model, provider, project")
    .option("--top <n>", "Top N items in breakdown", "5")
).action((opts: CommonOpts & { metric: string; by?: string; top: string }) => {
  const stats = loadAndAggregate(opts);
  const bucketSize = getBucketSize(opts.period as PeriodName);
  const metric = opts.metric as TrendMetric;
  const breakdownOpts = opts.by
    ? { by: opts.by as BreakdownDimension, top: parseInt(opts.top) }
    : undefined;

  const series = buildTimeSeries(stats.sessions, metric, bucketSize, breakdownOpts);

  if (opts.format === "json") {
    const jsonSeries = series.map((p) => ({
      date: p.date.toISOString(),
      label: p.label,
      value: p.value,
      breakdown: p.breakdown ? Object.fromEntries(p.breakdown) : undefined,
    }));
    console.log(JSON.stringify({ period: stats.period, metric, bucketSize, series: jsonSeries }, null, 2));
  } else {
    const byLabel = opts.by ? ` by ${opts.by}` : "";
    const title = `${metric}${byLabel} (${stats.period.label}, ${bucketSize})`;
    printTrend(series, title, metric);
  }
});

// report (HTML dashboard)
addCommonOptions(
  program
    .command("report")
    .description("Generate HTML dashboard (all sections)")
    .option("-o, --output <path>", "Output file path (default: temp file, opens browser)")
).action((opts: CommonOpts & { output?: string }) => {
  let sessions = loadSessions(opts);
  // Apply project filters before passing to HTML generator (which does its own period filtering)
  if (opts.project || opts.excludeProject) {
    sessions = sessions.filter((s) => {
      const proj = s.project.toLowerCase();
      if (opts.project && !proj.includes(opts.project.toLowerCase())) return false;
      if (opts.excludeProject) {
        for (const exclude of opts.excludeProject) {
          if (proj.includes(exclude.toLowerCase())) return false;
        }
      }
      return true;
    });
  }
  const html = generateHtml(sessions, opts.period as PeriodName, { showCost: !!opts.showCost });

  const outPath = opts.output ?? join(tmpdir(), `radian-report-${Date.now()}.html`);
  writeFileSync(outPath, html);

  if (!opts.output) {
    // Open in browser
    try {
      execSync(`xdg-open "${outPath}"`, { stdio: "ignore" });
    } catch {
      try { execSync(`open "${outPath}"`, { stdio: "ignore" }); } catch { /* ignore */ }
    }
  }

  console.log(`Dashboard written to ${outPath}`);
});

program.parse();
