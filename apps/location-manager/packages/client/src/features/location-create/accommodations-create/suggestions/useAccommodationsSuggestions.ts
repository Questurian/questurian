import type { Dispatch, SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { GooglePrefillResponse } from "@client/shared/services/api/types";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import type {
  AiSuggestedField,
  ApiFilledField,
} from "../accommodations-create.types";
import {
  canSuggestAccommodationsField,
  getEligibleAutoSuggestionFields,
} from "./accommodations-suggestion-eligibility";
import {
  buildAccommodationsSuggestionRequest,
  type LocationTypeOption,
} from "./accommodations-suggestion-request";
import { useAccommodationsAutoFill } from "./useAccommodationsAutoFill";
import { useAccommodationsSuggestionForm } from "./useAccommodationsSuggestionForm";
import { useAccommodationsSuggestionQueue } from "./useAccommodationsSuggestionQueue";

interface UseAccommodationsSuggestionsOptions {
  form: UseFormReturn<AddAccommodationsFormData>;
  isPrefillReady: boolean;
  locationTypes: LocationTypeOption[];
  apiFilledFields: Set<ApiFilledField>;
  googlePrefillContext: GooglePrefillResponse | null;
  setVerifiedAiUrls: Dispatch<SetStateAction<{ bookingUrl: boolean }>>;
}

/** Composes the add-flow suggestion form, review queue, and automatic batch. */
export function useAccommodationsSuggestions({
  form,
  isPrefillReady,
  locationTypes,
  apiFilledFields,
  googlePrefillContext,
  setVerifiedAiUrls,
}: UseAccommodationsSuggestionsOptions) {
  const suggestionForm = useAccommodationsSuggestionForm({
    form,
    locationTypes,
    setVerifiedAiUrls,
  });
  const isApiFilled = (field: string) =>
    apiFilledFields.has(field as ApiFilledField);
  const buildRequest = (
    fieldKey: AiSuggestedField,
    context = googlePrefillContext
  ) =>
    buildAccommodationsSuggestionRequest({
      fieldKey,
      formValues: form.getValues(),
      context,
      locationTypes,
    });

  const queue = useAccommodationsSuggestionQueue({
    locationTypes,
    buildRequest,
    applySuggestion: suggestionForm.applySuggestionToField,
  });
  const autoFill = useAccommodationsAutoFill({
    getEligibleFields: (fields) =>
      getEligibleAutoSuggestionFields({
        formValues: form.getValues(),
        apiFilledFields: fields,
        locationTypes,
      }),
    buildRequest,
    applySuggestion: suggestionForm.applySuggestionToField,
    setAiSuggestionEvidence: suggestionForm.setAiSuggestionEvidence,
    beginPending: queue.beginPending,
    endPending: queue.endPending,
  });

  const getCanSuggestField = (fieldKey: AiSuggestedField) =>
    canSuggestAccommodationsField({
      fieldKey,
      value: form.watch(fieldKey) as AddAccommodationsFormData[AiSuggestedField],
      locationTypes,
      isPrefillReady,
      isDirty: Boolean(form.formState.dirtyFields[fieldKey]),
      isApiFilled: isApiFilled(fieldKey),
      isAiSuggested: suggestionForm.isAiSuggested(fieldKey),
      isPending: queue.pendingFields.has(fieldKey),
      isQueued: queue.hasQueuedSuggestion(fieldKey),
    });

  const resetSuggestions = () => {
    suggestionForm.resetSuggestionForm();
    queue.resetSuggestionQueue();
    autoFill.resetAutoFill();
  };

  return {
    aiSuggestedFields: suggestionForm.aiSuggestedFields,
    aiSuggestionEvidence: suggestionForm.aiSuggestionEvidence,
    autoFillProgress: autoFill.autoFillProgress,
    isAiSuggested: suggestionForm.isAiSuggested,
    isManuallySelected: suggestionForm.isManuallySelected,
    isSectionPending: queue.isSectionPending,
    pendingFields: queue.pendingFields,
    queueSuggestion: queue.queueSuggestion,
    runAutoAiFill: autoFill.runAutoAiFill,
    setAiSuggestedFields: suggestionForm.setAiSuggestedFields,
    setAutoFillProgress: autoFill.setAutoFillProgress,
    setSingleOptionField: suggestionForm.setSingleOptionField,
    suggestionStack: queue.suggestionStack,
    applyStackedSuggestion: queue.applyStackedSuggestion,
    dismissStackedSuggestion: queue.dismissStackedSuggestion,
    toggleMultiOption: suggestionForm.toggleMultiOption,
    getCanSuggestField,
    isApiFilled,
    resetSuggestions,
    suggestAllFields: (fields: AiSuggestedField[]) =>
      fields
        .filter((field) => getCanSuggestField(field))
        .forEach((field) => void queue.queueSuggestion(field)),
  };
}
