function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const WEEKDAY_KEYS = new Set([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

function hasCanonicalRows(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((row) => {
    if (!isRecord(row)) return false;
    return typeof row.day === "string" && row.day.trim().length > 0 &&
      typeof row.hours === "string" && row.hours.trim().length > 0;
  });
}

export function hasMeaningfulOperationHours(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if ("hours" in value) return hasCanonicalRows(value.hours);

  return Object.entries(value).some(([key, entry]) =>
    WEEKDAY_KEYS.has(key.toLowerCase()) &&
    typeof entry === "string" &&
    entry.trim().length > 0
  );
}
