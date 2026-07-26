import type {
  AccommodationsFieldSuggestionRequest,
  AccommodationsFieldSuggestionResponse,
  GooglePrefillResponse,
} from "@client/shared/services/api/types";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import type { AiSuggestedField } from "../accommodations-create.types";
import {
  getSuggestionField,
  getSuggestionFieldOptions,
} from "./accommodations-suggestion-utils";

export type LocationTypeOption = { value: string; label: string };

export function buildAccommodationsSuggestionRequest({
  fieldKey,
  formValues,
  context,
  locationTypes,
}: {
  fieldKey: AiSuggestedField;
  formValues: AddAccommodationsFormData;
  context: GooglePrefillResponse | null;
  locationTypes: LocationTypeOption[];
}): AccommodationsFieldSuggestionRequest {
  return {
    category: "accommodations",
    fieldKey,
    formValues: formValues as unknown as Record<string, unknown>,
    apiContext: {
      googleUrl: context?.googleUrl || formValues.googleUrl || null,
      placeId: context?.placeId || formValues.placeId || null,
      locationKey: context?.locationKey || formValues.locationKey || null,
      district: context?.district || formValues.district || null,
      ianaTimeId: context?.ianaTimeId || formValues.ianaTimeId || null,
      phoneNumber: context?.phoneNumber || formValues.phone || null,
      website: context?.website || formValues.websiteUrl || null,
      priceLevel: context?.priceLevel || null,
      accommodationsHints: context?.accommodationsHints || null,
    },
    allowedOptions: getSuggestionFieldOptions(fieldKey, locationTypes),
  };
}

export function buildAccommodationsSuggestionError(
  fieldKey: AiSuggestedField,
  error: unknown
): AccommodationsFieldSuggestionResponse {
  const field = getSuggestionField(fieldKey);
  return {
    fieldKey,
    fieldLabel: field?.label || fieldKey,
    suggestion: null,
    kind: field?.kind || "single",
    confidence: 0,
    source: "ai",
    reason: "",
    sources: [],
    error: error instanceof Error ? error.message : "Unknown error",
  };
}

export function canRequestAccommodationsSuggestion(
  fieldKey: AiSuggestedField,
  locationTypes: LocationTypeOption[]
) {
  const field = getSuggestionField(fieldKey);
  return Boolean(
    field &&
      (field.kind === "url" ||
        getSuggestionFieldOptions(fieldKey, locationTypes).length > 0)
  );
}
