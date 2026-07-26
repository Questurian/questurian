import { useState, type Dispatch, type SetStateAction } from "react";
import { locationsApi } from "@client/shared/services/api";
import type {
  AccommodationsFieldSuggestionResponse,
  GooglePrefillResponse,
} from "@client/shared/services/api/types";
import { runSuggestionBatch } from "../../autofill/run-suggestion-batch";
import type {
  AiSuggestedField,
  AiSuggestionEvidence,
  ApiFilledField,
  AutoFillProgress,
} from "../accommodations-create.types";
import { getSuggestionField } from "./accommodations-suggestion-utils";
import { buildAccommodationsSuggestionError } from "./accommodations-suggestion-request";

const AUTO_FILL_CONCURRENCY = 3;

interface UseAccommodationsAutoFillOptions {
  getEligibleFields: (fields: Set<ApiFilledField>) => AiSuggestedField[];
  buildRequest: (
    fieldKey: AiSuggestedField,
    context: GooglePrefillResponse
  ) => Parameters<typeof locationsApi.suggestField>[0];
  applySuggestion: (
    item: AccommodationsFieldSuggestionResponse,
    source: "auto" | "manual"
  ) => boolean;
  setAiSuggestionEvidence: Dispatch<SetStateAction<AiSuggestionEvidence>>;
  beginPending: (fieldKey: AiSuggestedField) => void;
  endPending: (fieldKey: AiSuggestedField) => void;
}

export function useAccommodationsAutoFill({
  getEligibleFields,
  buildRequest,
  applySuggestion,
  setAiSuggestionEvidence,
  beginPending,
  endPending,
}: UseAccommodationsAutoFillOptions) {
  const [autoFillProgress, setAutoFillProgress] =
    useState<AutoFillProgress | null>(null);

  const runAutoAiFill = async (
    context: GooglePrefillResponse,
    fields: Set<ApiFilledField>
  ) => {
    const eligibleFields = getEligibleFields(fields);
    if (eligibleFields.length === 0) {
      return { applied: 0, failed: 0, total: 0 };
    }

    setAutoFillProgress({
      total: eligibleFields.length,
      completed: 0,
      applied: 0,
      failed: 0,
      currentFieldLabel: "Starting AI fill",
    });
    const result = await runSuggestionBatch({
      fields: eligibleFields,
      concurrency: AUTO_FILL_CONCURRENCY,
      run: async (fieldKey) => {
        const response = await locationsApi.suggestField(
          buildRequest(fieldKey, context)
        );
        if (!response.error && applySuggestion(response, "auto")) return true;
        setAiSuggestionEvidence((evidence) => ({
          ...evidence,
          [fieldKey]: response,
        }));
        return false;
      },
      onFieldStart: (fieldKey) => {
        beginPending(fieldKey);
        setAutoFillProgress((progress) =>
          progress
            ? {
                ...progress,
                currentFieldLabel:
                  getSuggestionField(fieldKey)?.label || fieldKey,
              }
            : progress
        );
      },
      onFieldSettled: (fieldKey, outcome, error, progress) => {
        if (outcome === "error") {
          setAiSuggestionEvidence((evidence) => ({
            ...evidence,
            [fieldKey]: buildAccommodationsSuggestionError(fieldKey, error),
          }));
        }
        endPending(fieldKey);
        setAutoFillProgress((current) =>
          current
            ? {
                ...current,
                completed: progress.completed,
                applied: progress.applied,
                failed: progress.failed,
              }
            : current
        );
      },
    });
    setAutoFillProgress(null);
    return result;
  };

  return {
    autoFillProgress,
    resetAutoFill: () => setAutoFillProgress(null),
    runAutoAiFill,
    setAutoFillProgress,
  };
}
