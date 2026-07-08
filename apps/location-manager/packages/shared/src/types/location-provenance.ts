// Who supplied a value on a Location field.
// `operator` is the implicit default for any field without an entry — it's only stored
// explicitly when needed to override a prior auto-fill source.
export type FieldProvenance =
  | "google"
  | "tripadvisor"
  | "scraper"
  | "ai"
  | "operator";

export const FIELD_PROVENANCE_VALUES: readonly FieldProvenance[] = [
  "google",
  "tripadvisor",
  "scraper",
  "ai",
  "operator",
] as const;

// Sidecar map keyed by field name. Per ADR-0002, this is LM-internal and not synced
// to Payload — it's an audit/UX layer over the operator-vs-pipeline value origin.
export type LocationProvenance = Partial<Record<string, FieldProvenance>>;

export function isFieldProvenance(value: unknown): value is FieldProvenance {
  return typeof value === "string" && (FIELD_PROVENANCE_VALUES as readonly string[]).includes(value);
}

// The functions below are the only sanctioned way to read, write, or mutate the
// sidecar. Entries with unknown provenance values are dropped rather than passed
// through, so every consumer sees the same map the badges render from.

export function sanitizeLocationProvenance(raw: unknown): LocationProvenance {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: LocationProvenance = {};
  for (const [field, value] of Object.entries(raw)) {
    if (isFieldProvenance(value)) result[field] = value;
  }
  return result;
}

export function parseLocationProvenanceJson(json: string | null | undefined): LocationProvenance {
  if (!json) return {};
  try {
    return sanitizeLocationProvenance(JSON.parse(json));
  } catch {
    return {};
  }
}

/** Null (not "{}") when empty, so the sidecar column clears instead of accreting. */
export function serializeLocationProvenanceJson(provenance: LocationProvenance): string | null {
  const entries = Object.entries(provenance).filter(([, value]) => isFieldProvenance(value));
  if (entries.length === 0) return null;
  return JSON.stringify(Object.fromEntries(entries));
}

/**
 * Operator edits flip ownership to `operator` (ADR-0002 §2). Since `operator`
 * is the implicit default for absent entries, demotion removes the entry.
 */
export function demoteToOperator(
  provenance: LocationProvenance,
  editedFields: Iterable<string>
): LocationProvenance {
  const next = { ...provenance };
  for (const field of editedFields) {
    delete next[field];
  }
  return next;
}
