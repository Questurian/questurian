import { useState } from "react";
import { locationsApi } from "@client/shared/services/api";
import type { AccommodationsFieldSuggestionResponse } from "@client/shared/services/api/types";
import type { AiSuggestedField } from "../accommodations-create.types";
import {
  buildAccommodationsSuggestionError,
  canRequestAccommodationsSuggestion,
  type LocationTypeOption,
} from "./accommodations-suggestion-request";

interface UseAccommodationsSuggestionQueueOptions {
  locationTypes: LocationTypeOption[];
  buildRequest: (fieldKey: AiSuggestedField) => Parameters<
    typeof locationsApi.suggestField
  >[0];
  applySuggestion: (
    item: AccommodationsFieldSuggestionResponse,
    source: "auto" | "manual"
  ) => boolean;
}

export function useAccommodationsSuggestionQueue({
  locationTypes,
  buildRequest,
  applySuggestion,
}: UseAccommodationsSuggestionQueueOptions) {
  const [pendingFields, setPendingFields] = useState<Set<AiSuggestedField>>(
    () => new Set()
  );
  const [suggestionStack, setSuggestionStack] = useState<
    AccommodationsFieldSuggestionResponse[]
  >([]);

  const beginPending = (fieldKey: AiSuggestedField) => {
    setPendingFields((pending) => new Set(pending).add(fieldKey));
  };

  const endPending = (fieldKey: AiSuggestedField) => {
    setPendingFields(
      (pending) => new Set([...pending].filter((item) => item !== fieldKey))
    );
  };

  const queueSuggestion = async (fieldKey: AiSuggestedField) => {
    if (!canRequestAccommodationsSuggestion(fieldKey, locationTypes)) return;

    beginPending(fieldKey);
    try {
      const response = await locationsApi.suggestField(buildRequest(fieldKey));
      setSuggestionStack((stack) => [...stack, response]);
    } catch (error) {
      setSuggestionStack((stack) => [
        ...stack,
        buildAccommodationsSuggestionError(fieldKey, error),
      ]);
    } finally {
      endPending(fieldKey);
    }
  };

  const removeFromStack = (item: AccommodationsFieldSuggestionResponse) => {
    setSuggestionStack((stack) =>
      stack.filter((suggestion) => suggestion !== item)
    );
  };

  const resetSuggestionQueue = () => {
    setPendingFields(new Set());
    setSuggestionStack([]);
  };

  return {
    applyStackedSuggestion: (
      item: AccommodationsFieldSuggestionResponse
    ) => {
      applySuggestion(item, "manual");
      removeFromStack(item);
    },
    beginPending,
    dismissStackedSuggestion: removeFromStack,
    endPending,
    hasQueuedSuggestion: (field: AiSuggestedField) =>
      suggestionStack.some((item) => item.fieldKey === field),
    isSectionPending: (fields: AiSuggestedField[]) =>
      fields.some((field) => pendingFields.has(field)),
    pendingFields,
    queueSuggestion,
    resetSuggestionQueue,
    suggestionStack,
  };
}
