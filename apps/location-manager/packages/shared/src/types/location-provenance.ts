// Who supplied a value on a Location field.
// `operator` is the implicit default for any field without an entry — it's only stored
// explicitly when needed to override a prior auto-fill source.
export type FieldProvenance =
  | "google"
  | "tripadvisor"
  | "scraper"
  | "ai-reviews"
  | "ai-google"
  | "operator";

export const FIELD_PROVENANCE_VALUES: readonly FieldProvenance[] = [
  "google",
  "tripadvisor",
  "scraper",
  "ai-reviews",
  "ai-google",
  "operator",
] as const;

// Sidecar map keyed by field name. Per ADR-0002, this is LM-internal and not synced
// to Payload — it's an audit/UX layer over the operator-vs-pipeline value origin.
export type LocationProvenance = Partial<Record<string, FieldProvenance>>;

export function isFieldProvenance(value: unknown): value is FieldProvenance {
  return typeof value === "string" && (FIELD_PROVENANCE_VALUES as readonly string[]).includes(value);
}
