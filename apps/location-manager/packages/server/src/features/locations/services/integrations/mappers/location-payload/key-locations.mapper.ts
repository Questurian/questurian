import type { LocationResponse } from "../../../../models/location";
import type { PayloadEntryData } from "../../clients/payload-api.client";
import type { UploadedImagesResult } from "../../types";
import { mapSharedPayloadFields } from "./shared-fields.mapper";
import {
  asRecord,
  asString,
  mapCategoryCommonPayloadFields,
  normalizeOperationHoursForPayload,
} from "./value-normalizers";

function getKeyLocationStatus(location: LocationResponse): string | undefined {
  const details = asRecord(location.keyLocationsDetails);
  if (!details) return undefined;
  const status = details.status ?? asRecord(details.core)?.status;
  return asString(status);
}

function getKeyLocationsDetailsPayload(location: LocationResponse): Record<string, unknown> {
  const details = asRecord(location.keyLocationsDetails) ?? {};
  const core = asRecord(details.core);

  return {
    core: {
      locationType:
        asString(details.location_type) ??
        asString(core?.locationType) ??
        asString(core?.location_type) ??
        asString(location.type) ??
        null,
      status: asString(details.status) ?? asString(core?.status) ?? null,
      neighborhood: asString(details.neighborhood) ?? asString(core?.neighborhood) ?? null,
    },
  };
}

export function mapKeyLocationsPayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  const { type, ianaTimeId } = mapCategoryCommonPayloadFields(location);

  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    type,
    ianaTimeId,
    ...(location.locationKey ? { location: location.locationKey } : {}),
    operationHours: normalizeOperationHoursForPayload(location.operationHours) ?? null,
    keyLocationsDetails: getKeyLocationsDetailsPayload(location),
    keyLocationStatus: getKeyLocationStatus(location) ?? null,
  };
}
