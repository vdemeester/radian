/**
 * Per-session cache with mtime-based invalidation.
 * Stores parsed SessionStats as JSON in ~/.cache/pi-stats/v1/.
 * Sessions are append-only, so mtime check is sufficient.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import type { SessionStats } from "./types.js";

const CACHE_VERSION = "v1";
const DEFAULT_CACHE_DIR = join(homedir(), ".cache", "pi-stats");

interface CacheEntry {
  mtime: number;
  stats: SerializedSessionStats;
}

/** SessionStats with Maps serialized as arrays of entries. */
interface SerializedSessionStats extends Omit<SessionStats, "tools" | "models" | "startTime" | "endTime"> {
  startTime: string;
  endTime: string;
  tools: [string, { calls: number; errors: number }][];
  models: [string, { calls: number; tokens: number; cost: number }][];
}

export class Cache {
  private dir: string;

  constructor(cacheDir?: string) {
    this.dir = join(cacheDir ?? DEFAULT_CACHE_DIR, CACHE_VERSION);
  }

  /** Get cached stats for a session file, or null if not cached/stale. */
  get(sessionPath: string, mtime: number): SessionStats | null {
    const cacheFile = this.cacheFilePath(sessionPath);
    if (!existsSync(cacheFile)) return null;

    try {
      const raw = readFileSync(cacheFile, "utf-8");
      const entry: CacheEntry = JSON.parse(raw);
      if (entry.mtime !== mtime) return null;
      return this.deserialize(entry.stats);
    } catch {
      return null;
    }
  }

  /** Store parsed stats for a session file. */
  set(sessionPath: string, mtime: number, stats: SessionStats): void {
    const cacheFile = this.cacheFilePath(sessionPath);
    mkdirSync(this.dir, { recursive: true });

    const entry: CacheEntry = {
      mtime,
      stats: this.serialize(stats),
    };

    try {
      writeFileSync(cacheFile, JSON.stringify(entry));
    } catch {
      // Cache write failure is non-fatal
    }
  }

  private cacheFilePath(sessionPath: string): string {
    const hash = createHash("sha256").update(sessionPath).digest("hex").slice(0, 16);
    return join(this.dir, `${hash}.json`);
  }

  private serialize(stats: SessionStats): SerializedSessionStats {
    return {
      ...stats,
      startTime: stats.startTime.toISOString(),
      endTime: stats.endTime.toISOString(),
      tools: [...stats.tools.entries()],
      models: [...stats.models.entries()],
    };
  }

  private deserialize(raw: SerializedSessionStats): SessionStats {
    return {
      ...raw,
      startTime: new Date(raw.startTime),
      endTime: new Date(raw.endTime),
      tools: new Map(raw.tools),
      models: new Map(raw.models),
    };
  }
}
