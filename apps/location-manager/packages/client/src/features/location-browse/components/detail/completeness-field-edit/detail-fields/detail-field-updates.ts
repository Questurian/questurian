import type {
  LocationResponse,
  UpdateMapsRequest,
} from "@client/shared/services/api/types";
import type {
  DetailDraftValue,
  DetailFieldConfig,
} from "./detail-field.types";
import {
  cloneDetails,
  deleteNested,
  encodeDetailValue,
  hasDetailFieldValue,
  normalizeSingle,
  setNested,
} from "./detail-value.utils";

export function canSaveDetailFieldValue(
  config: DetailFieldConfig,
  value: DetailDraftValue
): boolean {
  return Boolean(config.allowEmpty || hasDetailFieldValue(config, value));
}

export function withAttractionContactDetail(
  location: LocationResponse,
  payload: UpdateMapsRequest,
  field: "website" | "phone",
  value: string
): UpdateMapsRequest {
  if (location.category !== "attractions") return payload;

  const details = cloneDetails(location.attractionsDetails);
  const path = ["contact", field];
  const normalized = value.trim();
  if (normalized) setNested(details, path, normalized);
  else deleteNested(details, path);

  return { ...payload, attractionsDetails: details };
}

export function buildDetailFieldUpdatePayload(
  config: DetailFieldConfig,
  location: LocationResponse,
  value: DetailDraftValue
): UpdateMapsRequest {
  const details = cloneDetails(location[config.detailsKey]);
  if (config.allowEmpty && !hasDetailFieldValue(config, value)) {
    deleteNested(details, config.path);
  } else {
    setNested(details, config.path, encodeDetailValue(config.kind, value));
  }

  const payload: UpdateMapsRequest = { [config.detailsKey]: details };
  if (config.mirror === "type") payload.type = normalizeSingle(value);
  if (config.mirror === "priceLevel") {
    payload.priceLevel = normalizeSingle(value);
  }
  return payload;
}
