import { useState, type Dispatch, type SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AccommodationsFieldSuggestionResponse } from "@client/shared/services/api/types";
import { markAiUrlSuggested } from "../../autofill/ai-url-ack";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import type {
  AiSuggestedField,
  AiSuggestionEvidence,
  MultiField,
} from "../accommodations-create.types";
import {
  getSuggestionFieldOptions,
  validateClientSuggestion,
} from "./accommodations-suggestion-utils";
import type { LocationTypeOption } from "./accommodations-suggestion-request";

interface UseAccommodationsSuggestionFormOptions {
  form: UseFormReturn<AddAccommodationsFormData>;
  locationTypes: LocationTypeOption[];
  setVerifiedAiUrls: Dispatch<SetStateAction<{ bookingUrl: boolean }>>;
}

export function useAccommodationsSuggestionForm({
  form,
  locationTypes,
  setVerifiedAiUrls,
}: UseAccommodationsSuggestionFormOptions) {
  const [aiSuggestedFields, setAiSuggestedFields] = useState<
    Set<AiSuggestedField>
  >(() => new Set());
  const [manuallySelectedFields, setManuallySelectedFields] = useState<
    Set<AiSuggestedField>
  >(() => new Set());
  const [aiSuggestionEvidence, setAiSuggestionEvidence] =
    useState<AiSuggestionEvidence>({});

  const clearAiSuggestion = (field: AiSuggestedField) => {
    setAiSuggestedFields(
      (current) => new Set([...current].filter((item) => item !== field))
    );
    setAiSuggestionEvidence((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const markManuallySelected = (field: AiSuggestedField) => {
    clearAiSuggestion(field);
    setManuallySelectedFields((current) => new Set(current).add(field));
  };

  const setSingleOptionField = <
    TField extends Exclude<AiSuggestedField, MultiField>,
  >(
    field: TField,
    value: AddAccommodationsFormData[TField]
  ) => {
    form.setValue(field, value as never, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
    markManuallySelected(field);
  };

  const toggleMultiOption = (field: MultiField, value: string) => {
    const current = (form.getValues(field) || []) as string[];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    form.setValue(field, next as AddAccommodationsFormData[MultiField], {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
    markManuallySelected(field);
  };

  const applySuggestionToField = (
    item: AccommodationsFieldSuggestionResponse,
    source: "auto" | "manual"
  ) => {
    const fieldKey = item.fieldKey as AiSuggestedField;
    const suggestion = validateClientSuggestion(
      item.suggestion,
      getSuggestionFieldOptions(fieldKey, locationTypes),
      item.kind
    );
    if (!suggestion) return false;

    form.setValue(fieldKey, suggestion as never, {
      shouldDirty: source === "manual",
      shouldValidate: true,
      shouldTouch: true,
    });
    setAiSuggestedFields((fields) => new Set(fields).add(fieldKey));
    setManuallySelectedFields(
      (fields) => new Set([...fields].filter((field) => field !== fieldKey))
    );
    if (item.kind === "url" && fieldKey === "bookingUrl") {
      setVerifiedAiUrls((urls) => markAiUrlSuggested(urls, "bookingUrl"));
    }
    if (source === "auto") {
      setAiSuggestionEvidence((evidence) => ({
        ...evidence,
        [fieldKey]: item,
      }));
    }
    return true;
  };

  const resetSuggestionForm = () => {
    setAiSuggestedFields(new Set());
    setManuallySelectedFields(new Set());
    setAiSuggestionEvidence({});
  };

  return {
    aiSuggestedFields,
    aiSuggestionEvidence,
    applySuggestionToField,
    isAiSuggested: (field: AiSuggestedField) => aiSuggestedFields.has(field),
    isManuallySelected: (field: AiSuggestedField) =>
      manuallySelectedFields.has(field),
    resetSuggestionForm,
    setAiSuggestedFields,
    setAiSuggestionEvidence,
    setSingleOptionField,
    toggleMultiOption,
  };
}
