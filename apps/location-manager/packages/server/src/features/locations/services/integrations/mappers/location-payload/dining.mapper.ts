import type { LocationResponse } from "../../../../models/location";
import type { PayloadEntryData } from "../../clients/payload-api.client";
import type { UploadedImagesResult } from "../../types";
import { mapSharedPayloadFields } from "./shared-fields.mapper";
import {
  asString,
  mapCategoryCommonPayloadFields,
  normalizeOperationHoursForPayload,
} from "./value-normalizers";

export function mapDiningPayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  const sharedFields = mapSharedPayloadFields(location, uploadedImages, locationRef);
  const { countryCodeIso, sourceName, ...diningSharedFields } = sharedFields;

  return {
    ...diningSharedFields,
    ...mapCategoryCommonPayloadFields(location),
    operationHours: normalizeOperationHoursForPayload(location.operationHours) ?? null,
    idealFor: location.idealFor ?? [],
    cuisines: location.tripadvisorCuisines ?? [],
    menuUrl: asString(location.menuUrl) ?? null,
    bookingUrl: asString(location.bookingUrl) ?? null,
  };
}
