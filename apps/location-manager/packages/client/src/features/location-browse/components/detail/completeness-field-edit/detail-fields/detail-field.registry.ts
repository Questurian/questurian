import { ACCOMMODATIONS_DETAIL_FIELDS } from "./accommodations-detail-fields";
import { ATTRACTIONS_DETAIL_FIELDS } from "./attractions-detail-fields";
import type { DetailFieldConfig } from "./detail-field.types";
import { KEY_LOCATION_DETAIL_FIELDS } from "./key-location-detail-fields";

const DETAIL_FIELD_CONFIG: Record<string, DetailFieldConfig> = {
  ...ACCOMMODATIONS_DETAIL_FIELDS,
  ...ATTRACTIONS_DETAIL_FIELDS,
  ...KEY_LOCATION_DETAIL_FIELDS,
};

export function getDetailFieldConfig(
  fieldKey: string
): DetailFieldConfig | undefined {
  return DETAIL_FIELD_CONFIG[fieldKey];
}

export function isDetailFieldKey(fieldKey: string): boolean {
  return fieldKey in DETAIL_FIELD_CONFIG;
}

export function isDetailMultiFieldKey(fieldKey: string): boolean {
  return DETAIL_FIELD_CONFIG[fieldKey]?.kind === "multi";
}
