#!/usr/bin/env node

/**
 * radian — Analytics and usage insights for pi-coding-agent sessions.
 */

import { Command } from "commander";
import { parseAllSessions } from "./parser.js";
import { filterSessions, getFilterLabel } from "./filters.js";
import { aggregate } from "./aggregator.js";
import { printSummary, printTools, printModels, printProjects, printSessions } from "./formatters/table.js";
import { printJson } from "./formatters/json.js";
import type { FilterOptions, PeriodName } from "./types.js";

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
    .option("-f, --format <format>", "Output format: table, json", "table")
    .option("-l, --limit <n>", "Max rows in tables", "20")
    .option("--sessions-dir <path>", "Override session directory");
}

interface CommonOpts {
  period: PeriodName;
  from?: string;
  to?: string;
  project?: string;
  format: string;
  limit: string;
  sessionsDir?: string;
}

function buildFilterOpts(opts: CommonOpts): FilterOptions {
  return {
    period: opts.period as PeriodName,
    from: opts.from ? new Date(opts.from) : undefined,
    to: opts.to ? new Date(opts.to) : undefined,
    project: opts.project,
  };
}

function loadAndAggregate(opts: CommonOpts) {
  const allSessions = parseAllSessions({ sessionsDir: opts.sessionsDir });
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
    printJson(stats, "summary");
  } else {
    printSummary(stats);
  }
});

// tools
addCommonOptions(
  program
    .command("tools")
    .description("Tool usage breakdown")
).action((opts: CommonOpts) => {
  const stats = loadAndAggregate(opts);
  if (opts.format === "json") {
    printJson(stats, "tools");
  } else {
    printTools(stats, parseInt(opts.limit));
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
    printJson(stats, "models");
  } else {
    printModels(stats, parseInt(opts.limit));
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
    printJson(stats, "projects");
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
    printJson(stats, "sessions");
  } else {
    printSessions(stats, parseInt(opts.limit));
  }
});

program.parse();
