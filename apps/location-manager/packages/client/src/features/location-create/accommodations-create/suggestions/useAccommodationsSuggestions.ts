import { useState, type Dispatch, type SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import { locationsApi } from "@client/shared/services/api";
import type {
  AccommodationsFieldSuggestionResponse,
  GooglePrefillResponse,
} from "@client/shared/services/api/types";
import { markAiUrlSuggested } from "../../autofill/ai-url-ack";
import {
  isOptionSuggestionEligible,
  optionValueIsEmpty,
  optionValueMatchesDefault,
} from "../../autofill/option-suggestion-eligibility";
import { runSuggestionBatch } from "../../autofill/run-suggestion-batch";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import {
  ACCOMMODATIONS_FORM_DEFAULT_VALUES,
  type AiSuggestedField,
  type ApiFilledField,
  type AutoFillProgress,
  type MultiField,
} from "../accommodations-create.types";
import {
  AUTO_AI_SUGGESTION_FIELDS,
  getSuggestionField,
  getSuggestionFieldOptions,
  validateClientSuggestion,
} from "./accommodations-suggestion-utils";

const AUTO_FILL_CONCURRENCY = 3;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

interface UseAccommodationsSuggestionsOptions {
  form: UseFormReturn<AddAccommodationsFormData>;
  isPrefillReady: boolean;
  locationTypes: Array<{ value: string; label: string }>;
  apiFilledFields: Set<ApiFilledField>;
  googlePrefillContext: GooglePrefillResponse | null;
  setVerifiedAiUrls: Dispatch<SetStateAction<{ bookingUrl: boolean }>>;
}

export function useAccommodationsSuggestions({
  form,
  isPrefillReady,
  locationTypes,
  apiFilledFields,
  googlePrefillContext,
  setVerifiedAiUrls,
}: UseAccommodationsSuggestionsOptions) {
  const [aiSuggestedFields, setAiSuggestedFields] = useState<Set<AiSuggestedField>>(() => new Set());
  const [manuallySelectedFields, setManuallySelectedFields] = useState<Set<AiSuggestedField>>(() => new Set());
  const [pendingFields, setPendingFields] = useState<Set<AiSuggestedField>>(() => new Set());
  const [suggestionStack, setSuggestionStack] = useState<AccommodationsFieldSuggestionResponse[]>([]);
  const [autoFillProgress, setAutoFillProgress] = useState<AutoFillProgress | null>(null);
  const [aiSuggestionEvidence, setAiSuggestionEvidence] = useState<
    Partial<Record<AiSuggestedField, AccommodationsFieldSuggestionResponse>>
  >({});

  const resetSuggestions = () => {
    setAiSuggestedFields(new Set());
    setManuallySelectedFields(new Set());
    setPendingFields(new Set());
    setSuggestionStack([]);
    setAutoFillProgress(null);
    setAiSuggestionEvidence({});
  };
  const isApiFilled = (field: string) => apiFilledFields.has(field as ApiFilledField);
  const isAiSuggested = (field: AiSuggestedField) => aiSuggestedFields.has(field);
  const isManuallySelected = (field: AiSuggestedField) => manuallySelectedFields.has(field);
  const isEmptyOrDefaultSuggestionField = (field: AiSuggestedField) => {
    const value = form.getValues(field) as AddAccommodationsFormData[AiSuggestedField];
    return optionValueIsEmpty(value) || optionValueMatchesDefault(value, ACCOMMODATIONS_FORM_DEFAULT_VALUES[field]);
  };
  const getCanSuggestField = (field: AiSuggestedField) => {
    if (pendingFields.has(field) || suggestionStack.some((item) => item.fieldKey === field)) return false;
    const definition = getSuggestionField(field);
    return isOptionSuggestionEligible({
      value: form.watch(field) as AddAccommodationsFormData[AiSuggestedField],
      defaultValue: ACCOMMODATIONS_FORM_DEFAULT_VALUES[field],
      isPrefillReady,
      optionsCount: getSuggestionFieldOptions(field, locationTypes).length,
      isDirty: Boolean(form.formState.dirtyFields[field]),
      isApiFilled: isApiFilled(field),
      isAiSuggested: isAiSuggested(field),
      isUrlKind: definition?.kind === "url",
    });
  };
  const setSingleOptionField = <TField extends Exclude<AiSuggestedField, MultiField>>(
    field: TField,
    value: AddAccommodationsFormData[TField]
  ) => {
    form.setValue(field, value as never, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
    setAiSuggestedFields((current) => new Set([...current].filter((item) => item !== field)));
    setAiSuggestionEvidence((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setManuallySelectedFields((current) => new Set(current).add(field));
  };
  const toggleMultiOption = (field: MultiField, value: string) => {
    const current = (form.getValues(field) || []) as string[];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    form.setValue(field, next as AddAccommodationsFormData[MultiField], {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
    setAiSuggestedFields((fields) => new Set([...fields].filter((item) => item !== field)));
    setAiSuggestionEvidence((evidence) => {
      const nextEvidence = { ...evidence };
      delete nextEvidence[field];
      return nextEvidence;
    });
    setManuallySelectedFields((fields) => new Set(fields).add(field));
  };
  const buildSuggestionRequest = (fieldKey: AiSuggestedField, context: GooglePrefillResponse | null) => ({
    category: "accommodations" as const,
    fieldKey,
    formValues: form.getValues() as unknown as Record<string, unknown>,
    apiContext: {
      googleUrl: context?.googleUrl || form.getValues("googleUrl") || null,
      placeId: context?.placeId || form.getValues("placeId") || null,
      locationKey: context?.locationKey || form.getValues("locationKey") || null,
      district: context?.district || form.getValues("district") || null,
      ianaTimeId: context?.ianaTimeId || form.getValues("ianaTimeId") || null,
      phoneNumber: context?.phoneNumber || form.getValues("phone") || null,
      website: context?.website || form.getValues("websiteUrl") || null,
      priceLevel: context?.priceLevel || null,
      accommodationsHints: context?.accommodationsHints || null,
    },
    allowedOptions: getSuggestionFieldOptions(fieldKey, locationTypes),
  });
  const applySuggestionToField = (item: AccommodationsFieldSuggestionResponse, source: "auto" | "manual") => {
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
    setManuallySelectedFields((fields) => new Set([...fields].filter((field) => field !== fieldKey)));
    if (item.kind === "url" && fieldKey === "bookingUrl") {
      setVerifiedAiUrls((urls) => markAiUrlSuggested(urls, "bookingUrl"));
    }
    if (source === "auto") setAiSuggestionEvidence((evidence) => ({ ...evidence, [fieldKey]: item }));
    return true;
  };
  const runAutoAiFill = async (context: GooglePrefillResponse, fields: Set<ApiFilledField>) => {
    const eligibleFields = AUTO_AI_SUGGESTION_FIELDS.filter((fieldKey) => {
      const field = getSuggestionField(fieldKey);
      return Boolean(field) &&
        (field?.kind === "url" || getSuggestionFieldOptions(fieldKey, locationTypes).length > 0) &&
        !fields.has(fieldKey as ApiFilledField) &&
        isEmptyOrDefaultSuggestionField(fieldKey);
    });
    if (eligibleFields.length === 0) return { applied: 0, failed: 0, total: 0 };
    setAutoFillProgress({ total: eligibleFields.length, completed: 0, applied: 0, failed: 0, currentFieldLabel: "Starting AI fill" });
    const result = await runSuggestionBatch({
      fields: eligibleFields,
      concurrency: AUTO_FILL_CONCURRENCY,
      run: async (fieldKey) => {
        const response = await locationsApi.suggestField(buildSuggestionRequest(fieldKey, context));
        if (!response.error && applySuggestionToField(response, "auto")) return true;
        setAiSuggestionEvidence((evidence) => ({ ...evidence, [fieldKey]: response }));
        return false;
      },
      onFieldStart: (fieldKey) => {
        setPendingFields((pending) => new Set(pending).add(fieldKey));
        setAutoFillProgress((progress) => progress ? { ...progress, currentFieldLabel: getSuggestionField(fieldKey)?.label || fieldKey } : progress);
      },
      onFieldSettled: (fieldKey, outcome, error, progress) => {
        if (outcome === "error") {
          const field = getSuggestionField(fieldKey);
          setAiSuggestionEvidence((evidence) => ({
            ...evidence,
            [fieldKey]: { fieldKey, fieldLabel: field?.label || fieldKey, suggestion: null, kind: field?.kind || "single", confidence: 0, source: "ai", reason: "", sources: [], error: getErrorMessage(error) },
          }));
        }
        setPendingFields((pending) => new Set([...pending].filter((item) => item !== fieldKey)));
        setAutoFillProgress((current) => current ? { ...current, completed: progress.completed, applied: progress.applied, failed: progress.failed } : current);
      },
    });
    setAutoFillProgress(null);
    return { applied: result.applied, failed: result.failed, total: result.total };
  };
  const queueSuggestion = async (fieldKey: AiSuggestedField) => {
    const field = getSuggestionField(fieldKey);
    if (!field || getSuggestionFieldOptions(fieldKey, locationTypes).length === 0) return;
    setPendingFields((pending) => new Set(pending).add(fieldKey));
    try {
      const response = await locationsApi.suggestField(buildSuggestionRequest(fieldKey, googlePrefillContext));
      setSuggestionStack((stack) => [...stack, response]);
    } catch (error) {
      setSuggestionStack((stack) => [...stack, { fieldKey, fieldLabel: field.label, suggestion: null, kind: field.kind, confidence: 0, source: "ai", reason: "", sources: [], error: getErrorMessage(error) }]);
    } finally {
      setPendingFields((pending) => new Set([...pending].filter((item) => item !== fieldKey)));
    }
  };

  return {
    aiSuggestedFields, aiSuggestionEvidence, autoFillProgress, getCanSuggestField, isAiSuggested,
    isApiFilled, isManuallySelected, isSectionPending: (fields: AiSuggestedField[]) => fields.some((field) => pendingFields.has(field)),
    pendingFields, queueSuggestion, resetSuggestions, runAutoAiFill, setAiSuggestedFields,
    setAutoFillProgress, setSingleOptionField, suggestionStack,
    applyStackedSuggestion: (item: AccommodationsFieldSuggestionResponse) => {
      applySuggestionToField(item, "manual");
      setSuggestionStack((stack) => stack.filter((suggestion) => suggestion !== item));
    },
    dismissStackedSuggestion: (item: AccommodationsFieldSuggestionResponse) =>
      setSuggestionStack((stack) => stack.filter((suggestion) => suggestion !== item)),
    suggestAllFields: (fields: AiSuggestedField[]) =>
      fields.filter((field) => getCanSuggestField(field)).forEach((field) => void queueSuggestion(field)),
    toggleMultiOption,
  };
}
