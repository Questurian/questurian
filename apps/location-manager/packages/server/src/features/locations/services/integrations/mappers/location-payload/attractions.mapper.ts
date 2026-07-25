import type { LocationResponse } from "../../../../models/location";
import type { PayloadEntryData } from "../../clients/payload-api.client";
import type { UploadedImagesResult } from "../../types";
import { mapSharedPayloadFields } from "./shared-fields.mapper";
import {
  asBoolean,
  asRecord,
  asString,
  mapCategoryCommonPayloadFields,
  normalizeOperationHoursForPayload,
  toPayloadRelationshipId,
} from "./value-normalizers";

function getAttractionsDetailsPayload(location: LocationResponse): Record<string, unknown> {
  const details = asRecord(location.attractionsDetails) ?? {};
  const core = asRecord(details.core);
  const visit = asRecord(details.visit);

  return {
    core: {
      attractionType: asString(core?.attraction_type) ?? asString(location.type) ?? null,
      pricing: asString(core?.pricing) ?? asString(location.priceLevel) ?? null,
    },
    visit: {
      bookingRequired: asBoolean(visit?.booking_required) ?? false,
      bookingUrl: asString(location.bookingUrl) ?? null,
    },
  };
}

export function mapAttractionsPayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string,
  tourPayloadIds?: string[]
): PayloadEntryData {
  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    ...mapCategoryCommonPayloadFields(location),
    ...(location.locationKey ? { location: location.locationKey } : {}),
    operationHours: normalizeOperationHoursForPayload(location.operationHours) ?? null,
    attractionsDetails: getAttractionsDetailsPayload(location),
    ...(tourPayloadIds ? { tours: tourPayloadIds.map(toPayloadRelationshipId) } : {}),
  };
}
