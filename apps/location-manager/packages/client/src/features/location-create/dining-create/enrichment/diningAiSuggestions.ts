import type { UseFormReturn } from "react-hook-form";
import { locationsApi } from "@client/shared/services/api";
import type {
  DiningFieldSuggestionResponse,
  TripadvisorPrefillFields,
} from "@client/shared/services/api/types";
import type { FieldProvenance } from "@questurian/lm-shared";
import type { AddDiningFormData } from "../../validation/add-dining.schema";
import {
  AI_CONFIDENCE_THRESHOLD,
  AI_FIELD_KEYS,
  type AiFieldStatus,
  type AiSuggestionFieldKey,
  type ProvenanceTrackedField,
} from "../dining-create.types";

export type AiCallContext = {
  name: string;
  address: string;
  prefillType: string;
  currentIdealFor: string[];
};

export function initialAiFieldStatusMap(): Record<
  AiSuggestionFieldKey,
  AiFieldStatus
> {
  return AI_FIELD_KEYS.reduce(
    (statuses, key) => {
      statuses[key] = {
        state: "idle",
        confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
      };
      return statuses;
    },
    {} as Record<AiSuggestionFieldKey, AiFieldStatus>
  );
}

export function statusFromAiResult(
  result: DiningFieldSuggestionResponse
): AiFieldStatus {
  const details = {
    confidence: result.confidence,
    reason: result.reason,
    sources: result.sources,
    confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
  };
  if (result.error) {
    return { state: "error", errorMessage: result.error, ...details };
  }
  return {
    state: result.suggestion == null ? "no-result" : "suggested",
    ...details,
  };
}

export function statusFromThrown(error: unknown): AiFieldStatus {
  return {
    state: "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
  };
}

export function callDiningAiSuggestion(
  form: UseFormReturn<AddDiningFormData>,
  prefillWebsite: string | null,
  tripadvisorData: TripadvisorPrefillFields | null,
  fieldKey: AiSuggestionFieldKey,
  context: AiCallContext
): Promise<DiningFieldSuggestionResponse> {
  return locationsApi.suggestDiningField({
    category: "dining",
    fieldKey,
    formValues: {
      name: context.name,
      address: context.address,
      type: context.prefillType,
      idealFor: context.currentIdealFor,
    },
    apiContext: {
      placeId: form.getValues("placeId") || null,
      locationKey: form.getValues("locationKey") || null,
      district: form.getValues("district") || null,
      priceLevel: tripadvisorData?.priceLevel ?? null,
      website: form.getValues("website") || prefillWebsite || null,
      tripadvisorUrl: form.getValues("tripadvisorUrl") || null,
      tripadvisorMealTypes: tripadvisorData?.mealTypes ?? null,
      tripadvisorCuisines: tripadvisorData?.cuisines ?? null,
      tripadvisorFeatures: tripadvisorData?.features ?? null,
    },
  });
}

export function applyDiningAiResultToForm(
  form: UseFormReturn<AddDiningFormData>,
  result: DiningFieldSuggestionResponse,
  options: {
    wantsTypeFromAi: boolean;
    nextProvenance: Partial<
      Record<ProvenanceTrackedField, FieldProvenance>
    >;
    nextPrefilled: Partial<Record<ProvenanceTrackedField, string>>;
    onUrlSuggested?: (field: "menuUrl" | "bookingUrl") => void;
  }
) {
  const { wantsTypeFromAi, nextProvenance, nextPrefilled, onUrlSuggested } =
    options;
  if (result.fieldKey === "idealFor" && Array.isArray(result.suggestion)) {
    form.setValue(
      "idealFor",
      result.suggestion as AddDiningFormData["idealFor"],
      { shouldDirty: true, shouldValidate: true, shouldTouch: true }
    );
  }
  if (
    result.fieldKey === "type" &&
    typeof result.suggestion === "string" &&
    wantsTypeFromAi
  ) {
    form.setValue("type", result.suggestion, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
    nextProvenance.type = "ai";
    nextPrefilled.type = result.suggestion;
  }
  if (
    (result.fieldKey === "menuUrl" || result.fieldKey === "bookingUrl") &&
    typeof result.suggestion === "string"
  ) {
    const field = result.fieldKey;
    form.setValue(field, result.suggestion, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
    nextProvenance[field] = "ai";
    nextPrefilled[field] = result.suggestion;
    onUrlSuggested?.(field);
  }
}
