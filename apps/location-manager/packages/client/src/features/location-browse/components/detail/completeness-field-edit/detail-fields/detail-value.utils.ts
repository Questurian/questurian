import type {
  DetailDraftValue,
  DetailFieldConfig,
  DetailFieldKind,
} from "./detail-field.types";

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeSingle(value: DetailDraftValue): string {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim().length > 0)?.trim() ?? "";
  }
  return value.trim();
}

export function normalizeMulti(value: DetailDraftValue): string[] {
  return (Array.isArray(value) ? value : [value])
    .map((item) => item.trim())
    .filter(Boolean);
}

export function boolToDraft(value: boolean | null): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

export function cloneDetails(value: unknown): UnknownRecord {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed)
        ? (JSON.parse(JSON.stringify(parsed)) as UnknownRecord)
        : {};
    } catch {
      return {};
    }
  }
  return isRecord(value)
    ? (JSON.parse(JSON.stringify(value)) as UnknownRecord)
    : {};
}

export function setNested(
  root: UnknownRecord,
  path: string[],
  value: unknown
) {
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (!isRecord(current[key])) current[key] = {};
    current = current[key] as UnknownRecord;
  }
  current[path[path.length - 1]] = value;
}

export function deleteNested(root: UnknownRecord, path: string[]) {
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const next = current[path[index]];
    if (!isRecord(next)) return;
    current = next;
  }
  delete current[path[path.length - 1]];
}

export function encodeDetailValue(
  kind: DetailFieldKind,
  value: DetailDraftValue
): unknown {
  if (kind === "multi") return normalizeMulti(value);
  if (kind === "boolean") {
    const normalized = normalizeSingle(value);
    if (normalized === "yes") return true;
    if (normalized === "no") return false;
    return null;
  }
  return normalizeSingle(value);
}

export function hasDetailFieldValue(
  config: DetailFieldConfig,
  value: DetailDraftValue
): boolean {
  return config.kind === "multi"
    ? normalizeMulti(value).length > 0
    : normalizeSingle(value).length > 0;
}
