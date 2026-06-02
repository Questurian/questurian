import { isDetailFieldKey } from "../completeness-field-edit/completeness-detail-fields";
import type { CompletenessField } from "./types";

const READ_ONLY_COMPLETENESS_FIELD_KEYS = new Set(["category", "slug"]);

export function isReadOnlyCompletenessField(fieldKey: string): boolean {
  return READ_ONLY_COMPLETENESS_FIELD_KEYS.has(fieldKey);
}

export function getCompletenessEditField(field: CompletenessField): CompletenessField {
  const present = Boolean(field.present);
  // Fields with a granular detail-field config are edited in a targeted editor,
  // so they keep their original key instead of remapping to a raw JSON blob.
  if (isDetailFieldKey(field.key)) {
    return { ...field, present };
  }
  if (field.key.startsWith("accommodations.")) {
    return {
      key: "accommodationsDetails",
      label: "Accommodations Profile",
      present,
    };
  }
  if (field.key.startsWith("attractions.")) {
    return {
      key: "attractionsDetails",
      label: "Attractions Profile",
      present,
    };
  }
  if (field.key.startsWith("keyLocations.")) {
    return {
      key: "keyLocationsDetails",
      label: "Key Locations Profile",
      present,
    };
  }
  return { ...field, present };
}
