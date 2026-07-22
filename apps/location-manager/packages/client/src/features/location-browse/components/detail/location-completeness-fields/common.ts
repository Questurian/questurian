import type { LocationResponse } from "@client/shared/services/api/types";
import { parseAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import { parseAttractionsDetails } from "@client/shared/lib/attractions-details";
import { hasMeaningfulOperationHours } from "@client/shared/lib/operation-hours";
import { parseNightlifeDetails } from "../../../utils/nightlife-details";
import type { CompletenessFieldContext } from "./types";

export function createCompletenessFieldContext(
  locationDetail: LocationResponse
): CompletenessFieldContext {
  const contact = locationDetail.contact || {};
  const source = locationDetail.source || {};
  const keyLocationsDetails = asRecord(locationDetail.keyLocationsDetails);
  const hasOperationHours = hasMeaningfulOperationHours(locationDetail.operationHours);
  const hasMedia = Boolean(
    (locationDetail.uploads && locationDetail.uploads.length > 0) ||
    (locationDetail.instagram_embeds && locationDetail.instagram_embeds.length > 0) ||
    (locationDetail.selectedPayloadMediaSetIds &&
      locationDetail.selectedPayloadMediaSetIds.length > 0)
  );
  const hasIdealFor = Boolean(Array.isArray(locationDetail.idealFor) && locationDetail.idealFor.length > 0);
  const hasCuisines = Boolean(
    Array.isArray(locationDetail.tripadvisorCuisines) && locationDetail.tripadvisorCuisines.length > 0
  );
  const hasKeyLocationsHours = getHasKeyLocationsHours(hasOperationHours, keyLocationsDetails);
  const hasKeyLocationImages = Array.isArray(keyLocationsDetails?.images) && keyLocationsDetails.images.length > 0;

  const context = {
    locationDetail,
    contact,
    source,
    keyLocationsDetails,
    hasOperationHours,
    hasMedia,
    hasIdealFor,
    hasCuisines,
    hasKeyLocationsHours,
    hasKeyLocationImages,
  } as CompletenessFieldContext;

  defineLazyDetail(context, "nightlifeDetails", () => parseNightlifeDetails(locationDetail.nightlifeDetails));
  defineLazyDetail(context, "accommodationsDetails", () =>
    parseAccommodationsDetails(locationDetail.accommodationsDetails)
  );
  defineLazyDetail(context, "attractionsDetails", () => parseAttractionsDetails(locationDetail.attractionsDetails));

  return context;
}

function defineLazyDetail<TKey extends keyof CompletenessFieldContext>(
  context: CompletenessFieldContext,
  key: TKey,
  factory: () => CompletenessFieldContext[TKey]
): void {
  let value: CompletenessFieldContext[TKey] | undefined;
  Object.defineProperty(context, key, {
    enumerable: true,
    get() {
      value ??= factory();
      return value;
    },
  });
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function getHasKeyLocationsHours(
  hasOperationHours: boolean,
  keyLocationsDetails: Record<string, unknown> | null
): boolean {
  if (hasOperationHours) return true;
  const hoursValue = keyLocationsDetails?.hours;
  if (!hoursValue) return false;
  if (typeof hoursValue === "string") return hoursValue.trim().length > 0;
  if (Array.isArray(hoursValue)) return hoursValue.length > 0;
  if (typeof hoursValue === "object") return hasMeaningfulOperationHours(hoursValue);
  return false;
}
