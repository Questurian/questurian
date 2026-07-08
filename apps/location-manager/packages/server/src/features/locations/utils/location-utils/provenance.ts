import {
  demoteToOperator,
  parseLocationProvenanceJson,
  serializeLocationProvenanceJson,
} from "@questurian/lm-shared";
import type { Location } from "../../models/location";

// Location columns whose provenance is audited (ADR-0002 §2). `idealFor` is
// handled separately because it persists as idealForJson.
const PROVENANCE_AUDITED_COLUMNS = [
  "title",
  "type",
  "tripadvisorUrl",
  "menuUrl",
  "bookingUrl",
] as const;

function normalizeScalar(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function idealForTagSet(json: unknown): string {
  if (typeof json !== "string" || !json) return "";
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return "";
    const tags = parsed
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    return JSON.stringify(Array.from(new Set(tags)).sort());
  } catch {
    return "";
  }
}

/**
 * Enforces the ADR-0002 flip-to-operator invariant at the persistence choke
 * point: any operator edit that changes the value of a provenance-tracked
 * field demotes that field to operator ownership.
 *
 * `updateData` holds the final column values about to be persisted. Returns
 * the new provenanceJson (null when the map empties), or undefined when no
 * tracked field changed.
 */
export function demoteProvenanceForOperatorEdit(
  location: Location,
  updateData: Record<string, unknown>
): string | null | undefined {
  const provenance = parseLocationProvenanceJson(location.provenanceJson);
  if (Object.keys(provenance).length === 0) return undefined;

  const editedFields: string[] = [];
  for (const column of PROVENANCE_AUDITED_COLUMNS) {
    if (!(column in updateData) || !(column in provenance)) continue;
    if (normalizeScalar(updateData[column]) !== normalizeScalar(location[column])) {
      editedFields.push(column);
    }
  }
  if (
    "idealForJson" in updateData &&
    "idealFor" in provenance &&
    idealForTagSet(updateData["idealForJson"]) !== idealForTagSet(location.idealForJson)
  ) {
    editedFields.push("idealFor");
  }

  if (editedFields.length === 0) return undefined;
  return serializeLocationProvenanceJson(demoteToOperator(provenance, editedFields));
}
