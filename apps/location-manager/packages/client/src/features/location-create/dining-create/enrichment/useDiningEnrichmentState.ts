import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { TripadvisorPrefillFields } from "@client/shared/services/api/types";
import type { FieldProvenance } from "@questurian/lm-shared";
import {
  allAiUrlsAcknowledged,
  initAiUrlAck,
  liftAiUrlAckOnUserEdit,
  setAiUrlAcknowledged,
  type AiUrlAckState,
} from "../../autofill/ai-url-ack";
import {
  buildDiningPrefillSignature,
  type AddDiningFormData,
} from "../../validation/add-dining.schema";
import type {
  AiFieldStatus,
  AiSuggestionFieldKey,
  ProvenanceTrackedField,
} from "../dining-create.types";
import { PROVENANCE_TRACKED_FIELDS } from "../dining-create.types";
import { initialAiFieldStatusMap } from "./diningAiSuggestions";

export const AI_URL_ACK_FIELDS = ["menuUrl", "bookingUrl"] as const;
export type AiUrlAckField = (typeof AI_URL_ACK_FIELDS)[number];

export function useDiningEnrichmentState(
  form: UseFormReturn<AddDiningFormData>
) {
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [prefillOperationHours, setPrefillOperationHours] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [prefillPhoneNumber, setPrefillPhoneNumber] = useState<string | null>(
    null
  );
  const [prefillWebsite, setPrefillWebsite] = useState<string | null>(null);
  const [prefillTripadvisorPlaceData, setPrefillTripadvisorPlaceData] =
    useState<TripadvisorPrefillFields | null>(null);
  const [aiBatchStep, setAiBatchStep] = useState<
    "google" | "tripadvisor" | "ai" | null
  >(null);
  const [verifiedAiUrls, setVerifiedAiUrls] = useState<
    AiUrlAckState<AiUrlAckField>
  >(() => initAiUrlAck(AI_URL_ACK_FIELDS));
  const [provenance, setProvenance] = useState<
    Partial<Record<ProvenanceTrackedField, FieldProvenance>>
  >({});
  const [prefilledValues, setPrefilledValues] = useState<
    Partial<Record<ProvenanceTrackedField, string>>
  >({});
  const [aiFieldStatus, setAiFieldStatus] = useState<
    Record<AiSuggestionFieldKey, AiFieldStatus>
  >(() => initialAiFieldStatusMap());

  const currentSignature = buildDiningPrefillSignature(
    form.watch("name"),
    form.watch("address")
  );
  const isPrefillReady =
    prefillSignature !== null && prefillSignature === currentSignature;

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (!name) return;
      const trackedField = PROVENANCE_TRACKED_FIELDS.find(
        (field) => field === name
      );
      if (!trackedField) return;
      const current = (value as Partial<AddDiningFormData>)[trackedField];
      const prefilled = prefilledValues[trackedField];
      if (prefilled === undefined) return;
      if (typeof current !== "string" || current !== prefilled) {
        setProvenance((previous) => {
          if (!(trackedField in previous)) return previous;
          const next = { ...previous };
          delete next[trackedField];
          return next;
        });
        if (trackedField === "menuUrl" || trackedField === "bookingUrl") {
          setVerifiedAiUrls((previous) =>
            liftAiUrlAckOnUserEdit(previous, trackedField)
          );
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, prefilledValues]);

  const resetEnrichmentState = () => {
    setPrefillSignature(null);
    setPrefillOperationHours(null);
    setPrefillPhoneNumber(null);
    setPrefillWebsite(null);
    setPrefillTripadvisorPlaceData(null);
    setProvenance({});
    setPrefilledValues({});
    setVerifiedAiUrls(initAiUrlAck(AI_URL_ACK_FIELDS));
    setAiFieldStatus(initialAiFieldStatusMap());
  };

  const acknowledgeAiUrl = (field: AiUrlAckField, verified: boolean) => {
    setVerifiedAiUrls((previous) =>
      setAiUrlAcknowledged(previous, field, verified)
    );
  };

  return {
    isPrefillingGoogle,
    setIsPrefillingGoogle,
    prefillMessage,
    setPrefillMessage,
    prefillError,
    setPrefillError,
    prefillSignature,
    setPrefillSignature,
    prefillOperationHours,
    setPrefillOperationHours,
    prefillPhoneNumber,
    setPrefillPhoneNumber,
    prefillWebsite,
    setPrefillWebsite,
    prefillTripadvisorPlaceData,
    setPrefillTripadvisorPlaceData,
    aiBatchStep,
    setAiBatchStep,
    verifiedAiUrls,
    setVerifiedAiUrls,
    provenance,
    setProvenance,
    prefilledValues,
    setPrefilledValues,
    aiFieldStatus,
    setAiFieldStatus,
    isPrefillReady,
    prefillIsStale: prefillSignature !== null && !isPrefillReady,
    resetEnrichmentState,
    acknowledgeAiUrl,
    allAiUrlsVerified: allAiUrlsAcknowledged(verifiedAiUrls),
  };
}
