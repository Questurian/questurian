/**
 * Formatting for numbers an operator is scanning, not reading closely.
 *
 * Every helper here answers "what does this look like in a dense table", and
 * they all render a missing value as an em dash rather than as zero -- "no
 * measurement" and "zero" are different facts and the UI must not merge them.
 */

export const MISSING = "—";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en-US");

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return MISSING;
  return value < 10_000 ? plain.format(value) : compact.format(value);
}

export function formatExactCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return MISSING;
  return plain.format(value);
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return MISSING;
  if (value === 0) return "0";
  return compact.format(value);
}

/** Costs below a cent still matter in aggregate, so small values keep digits. */
export function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined) return MISSING;
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 100) return `$${value.toFixed(2)}`;
  return `$${plain.format(Math.round(value))}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return MISSING;
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return MISSING;
  const percent = fraction * 100;
  if (percent > 0 && percent < 0.1) return "<0.1%";
  return `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
}

export function formatClock(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return MISSING;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDateTime(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return MISSING;
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Axis label whose granularity matches the bucket being charted. */
export function formatBucketTick(ts: number, bucket: "minute" | "hour" | "day"): string {
  const date = new Date(ts);
  if (bucket === "day") return date.toLocaleDateString([], { month: "short", day: "numeric" });
  if (bucket === "hour") {
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" });
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(ts: number | null | undefined, now: number = Date.now()): string {
  if (ts === null || ts === undefined) return MISSING;
  const seconds = Math.round((now - ts) / 1_000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
