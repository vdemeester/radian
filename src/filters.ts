/**
 * Period and project filtering for session stats.
 */

import type { FilterOptions, PeriodName, SessionStats } from "./types.js";

/** Compute period date range from a period name. */
export function periodToRange(period: PeriodName): { from: Date; to: Date; label: string } {
  const now = new Date();
  const to = new Date(now);
  let from: Date;
  let label: string;

  switch (period) {
    case "today": {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      label = `Today (${formatDate(from)})`;
      break;
    }
    case "week": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday as start
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      label = `This week (${formatDate(from)} – ${formatDate(to)})`;
      break;
    }
    case "month": {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      label = `${now.toLocaleString("en", { month: "long", year: "numeric" })}`;
      break;
    }
    case "quarter": {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      from = new Date(now.getFullYear(), quarterStart, 1);
      const q = Math.floor(quarterStart / 3) + 1;
      label = `Q${q} ${now.getFullYear()}`;
      break;
    }
    case "year": {
      from = new Date(now.getFullYear(), 0, 1);
      label = `${now.getFullYear()}`;
      break;
    }
    case "all": {
      from = new Date(0);
      label = "All time";
      break;
    }
  }

  return { from, to, label };
}

/** Filter sessions by period and/or project. */
export function filterSessions(sessions: SessionStats[], opts: FilterOptions): SessionStats[] {
  let range: { from: Date; to: Date };

  if (opts.from || opts.to) {
    range = {
      from: opts.from ?? new Date(0),
      to: opts.to ?? new Date(),
    };
  } else {
    range = periodToRange(opts.period);
  }

  return sessions.filter((s) => {
    // Period filter
    if (s.startTime < range.from || s.startTime > range.to) return false;

    // Project filter (substring match)
    if (opts.project) {
      const proj = s.project.toLowerCase();
      const filter = opts.project.toLowerCase();
      if (!proj.includes(filter)) return false;
    }

    // Project exclusion filter (substring match)
    if (opts.excludeProjects && opts.excludeProjects.length > 0) {
      const proj = s.project.toLowerCase();
      for (const exclude of opts.excludeProjects) {
        if (proj.includes(exclude.toLowerCase())) return false;
      }
    }

    return true;
  });
}

/** Get the display label for the current filter. */
export function getFilterLabel(opts: FilterOptions): string {
  if (opts.from || opts.to) {
    const from = opts.from ? formatDate(opts.from) : "beginning";
    const to = opts.to ? formatDate(opts.to) : "now";
    return `${from} – ${to}`;
  }
  return periodToRange(opts.period).label;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}
