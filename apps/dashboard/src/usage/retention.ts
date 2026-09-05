import type { UsageStore } from "./store";

export const DEFAULT_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;
const PURGE_INTERVAL_MS = DAY_MS;

/**
 * How long events are kept. `0` disables purging entirely, which is the only
 * way to say "keep everything" without inventing a second env var.
 */
export function retentionDays(): number {
  const raw = process.env.USAGE_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_RETENTION_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RETENTION_DAYS;
  return parsed;
}

export function purgeExpired(store: UsageStore, now: number = Date.now()): number {
  const days = retentionDays();
  if (days === 0) return 0;
  return store.purgeOlderThan(now - days * DAY_MS);
}

/**
 * Purge once at boot, then daily. Unref'd so it never holds the process open;
 * this is a dev tool that gets Ctrl-C'd, and a pending timer that blocks exit
 * would be read as a hang.
 */
export function startRetentionSweep(
  store: UsageStore,
  onPurge: (removed: number) => void = () => {},
): () => void {
  const sweep = () => {
    try {
      const removed = purgeExpired(store);
      if (removed > 0) onPurge(removed);
    } catch {
      // Retention is housekeeping. It must never take the collector down.
    }
  };

  sweep();
  const timer = setInterval(sweep, PURGE_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
