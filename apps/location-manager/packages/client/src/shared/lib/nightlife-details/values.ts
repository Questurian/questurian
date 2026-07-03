import { NIGHTLIFE_FIELD_CONFIG, type NightlifeFieldKey } from "./config";
import type { UnknownRecord } from "./types";

export function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));
  }

  const single = asString(value);
  return single ? [single] : [];
}

export function getNestedValue(record: UnknownRecord | null, path: string[]): unknown {
  if (!record) return undefined;

  let current: unknown = record;
  for (const key of path) {
    const nextRecord = asRecord(current);
    if (!nextRecord) return undefined;
    current = nextRecord[key];
  }

  return current;
}

export function getSectionValue(
  details: UnknownRecord | null,
  section: "theSpace" | "theScene",
  key: string
): unknown {
  const raw = getNestedValue(details, ["details", section, key]);
  const rawRecord = asRecord(raw);
  if (rawRecord && "value" in rawRecord) {
    return rawRecord.value;
  }
  return raw;
}

export function cloneNightlifeDetails(details: unknown): UnknownRecord {
  if (typeof details === "string") {
    try {
      const parsed = JSON.parse(details);
      const record = asRecord(parsed);
      return record ? (JSON.parse(JSON.stringify(record)) as UnknownRecord) : {};
    } catch {
      return {};
    }
  }

  const record = asRecord(details);
  return record ? (JSON.parse(JSON.stringify(record)) as UnknownRecord) : {};
}

export function normalizeSingleValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim().length > 0)?.trim() ?? "";
  }
  return value.trim();
}

export function normalizeMultiValue(value: string | string[]): string[] {
  return (Array.isArray(value) ? value : [value])
    .map((item) => item.trim())
    .filter(Boolean);
}

export function setNightlifeFieldValue(
  root: UnknownRecord,
  fieldKey: NightlifeFieldKey,
  value: string | string[]
) {
  const config = NIGHTLIFE_FIELD_CONFIG[fieldKey];

  if (!("section" in config)) {
    if (fieldKey === "nightlife.daytimeRestaurant") {
      root[config.storage] = Number(normalizeSingleValue(value) || "0");
      return;
    }

    root[config.storage] = config.kind === "multi" ? normalizeMultiValue(value) : normalizeSingleValue(value);
    return;
  }

  const nextValue = config.kind === "multi" ? normalizeMultiValue(value) : normalizeSingleValue(value);
  const detailsRoot = asRecord(root.details) ? { ...(root.details as UnknownRecord) } : {};
  const sectionRoot = asRecord(detailsRoot[config.section])
    ? { ...(detailsRoot[config.section] as UnknownRecord) }
    : {};

  sectionRoot[config.storage] = {
    label: config.label,
    value: nextValue,
  };
  detailsRoot[config.section] = sectionRoot;
  root.details = detailsRoot;
}
