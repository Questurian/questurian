import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import { locationsApi } from "@client/shared/services/api";
import { LOCATION_BY_ID_QUERY_KEY } from "@client/shared/services/api/hooks/useLocationById";
import type { AccommodationsFieldSuggestionResponse } from "@client/shared/services/api/types";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import type { AiSuggestedField } from "../../accommodations-create/accommodations-create.types";
import {
  getSuggestionField,
  getSuggestionFieldOptions,
  validateClientSuggestion,
} from "../../accommodations-create/suggestions/accommodations-suggestion-utils";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

type BookingSuggestState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string };

interface UseAccommodationsEditSuggestionsParams {
  form: UseFormReturn<AddAccommodationsFormData>;
  locationId: number | null;
  locationTypes: Array<{ value: string; label: string }>;
}

/** Per-field AI suggestion queue and booking-URL pending suggestion for the edit form. */
export function useAccommodationsEditSuggestions({
  form,
  locationId,
  locationTypes,
}: UseAccommodationsEditSuggestionsParams) {
  const queryClient = useQueryClient();
  const [pendingFields, setPendingFields] = useState<Set<AiSuggestedField>>(() => new Set());
  const [suggestionStack, setSuggestionStack] = useState<AccommodationsFieldSuggestionResponse[]>([]);
  const [bookingSuggestState, setBookingSuggestState] = useState<BookingSuggestState>({ status: "idle" });

  const queueSuggestion = async (fieldKey: AiSuggestedField) => {
    const field = getSuggestionField(fieldKey);
    const allowedOptions = getSuggestionFieldOptions(fieldKey, locationTypes);
    const isUrlKind = field?.kind === "url";
    if (!field || (!isUrlKind && allowedOptions.length === 0) || locationId === null) return;

    setPendingFields((prev) => new Set(prev).add(fieldKey));

    try {
      const response = await locationsApi.suggestField({
        category: "accommodations",
        locationId,
        fieldKey,
        formValues: form.getValues() as unknown as Record<string, unknown>,
        apiContext: {
          googleUrl: form.getValues("googleUrl") || null,
          placeId: form.getValues("placeId") || null,
          locationKey: form.getValues("locationKey") || null,
          district: form.getValues("district") || null,
          ianaTimeId: form.getValues("ianaTimeId") || null,
          phoneNumber: form.getValues("phone") || null,
          website: form.getValues("websiteUrl") || null,
        },
        allowedOptions,
      });
      setSuggestionStack((prev) => [...prev, response]);
    } catch (err) {
      setSuggestionStack((prev) => [
        ...prev,
        {
          fieldKey,
          fieldLabel: field.label,
          suggestion: null,
          kind: field.kind,
          confidence: 0,
          source: "ai",
          reason: "",
          sources: [],
          error: getErrorMessage(err),
        },
      ]);
    } finally {
      setPendingFields((prev) => {
        const next = new Set(prev);
        next.delete(fieldKey);
        return next;
      });
    }
  };

  const applyStackedSuggestion = (item: AccommodationsFieldSuggestionResponse) => {
    const fieldKey = item.fieldKey as AiSuggestedField;
    const allowedOptions = getSuggestionFieldOptions(fieldKey, locationTypes);
    const validatedSuggestion = validateClientSuggestion(item.suggestion, allowedOptions, item.kind);

    if (validatedSuggestion) {
      form.setValue(fieldKey, validatedSuggestion as AddAccommodationsFormData[typeof fieldKey], {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
    }
    setSuggestionStack((prev) => prev.filter((s) => s !== item));
  };

  const dismissStackedSuggestion = (item: AccommodationsFieldSuggestionResponse) => {
    setSuggestionStack((prev) => prev.filter((s) => s !== item));
  };

  const canSuggest = (fieldKey: AiSuggestedField) => {
    const name = form.watch("name")?.trim();
    const address = form.watch("address")?.trim();
    const field = getSuggestionField(fieldKey);
    const options = getSuggestionFieldOptions(fieldKey, locationTypes);
    return Boolean(name && address && field && (field.kind === "url" || options.length > 0));
  };

  const suggestProps = (fieldKey: AiSuggestedField) => ({
    canSuggest: canSuggest(fieldKey),
    isSuggesting: pendingFields.has(fieldKey),
    onSuggest: () => void queueSuggestion(fieldKey),
  });

  const handleBookingUrlSuggest = async () => {
    if (!locationId) return;
    setBookingSuggestState({ status: "busy" });
    try {
      await locationsApi.proposePendingSuggestion(locationId, "bookingUrl");
      await queryClient.invalidateQueries({
        queryKey: LOCATION_BY_ID_QUERY_KEY("accommodations", locationId),
      });
      setBookingSuggestState({ status: "idle" });
    } catch (err) {
      setBookingSuggestState({ status: "error", message: getErrorMessage(err) });
    }
  };

  return {
    pendingFields,
    suggestionStack,
    bookingSuggestState,
    applyStackedSuggestion,
    dismissStackedSuggestion,
    suggestProps,
    handleBookingUrlSuggest,
  };
}
