/**
 * Utility functions for formatting and display.
 */

/** Format a number with comma separators. */
export function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

/** Format milliseconds as human-readable duration. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return remainMin > 0 ? `${hours}h ${remainMin}min` : `${hours}h`;
}

/** Format a date as relative time ("today", "yesterday", "3 days ago", etc.). */
export function formatRelativeTime(date: Date | null): string {
  if (!date) return "never";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  return `${Math.floor(diffDays / 30)} months ago`;
}

/** Format a percentage. */
export function formatPct(value: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

/** Pad a string to a given width. */
export function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/** Pad a string on the left to a given width. */
export function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

/**
 * Split a model key (model@provider) into [model, provider].
 * Handles model names with embedded @date suffixes like "claude-sonnet-4-5@20250929".
 * The provider is always the last @-segment that isn't purely numeric.
 */
export function splitModelKey(key: string): [string, string] {
  const lastAt = key.lastIndexOf("@");
  if (lastAt === -1) return [key, "unknown"];

  const suffix = key.slice(lastAt + 1);
  // If the last segment is all digits, it's a date suffix (part of model name), not a provider
  if (/^\d+$/.test(suffix)) {
    return [key, "unknown"];
  }

  return [key.slice(0, lastAt), suffix];
}

/** Create a simple horizontal bar using block characters. */
export function bar(value: number, max: number, width: number = 30): string {
  if (max === 0) return "░".repeat(width);
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
