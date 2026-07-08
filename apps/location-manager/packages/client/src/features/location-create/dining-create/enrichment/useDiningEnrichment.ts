import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { locationsApi } from "@client/shared/services/api";
import type {
  DiningFieldSuggestionResponse,
  TripadvisorPrefillFields,
} from "@client/shared/services/api/types";
import { isFieldProvenance, type FieldProvenance } from "@questurian/lm-shared";
import {
  buildDiningPrefillSignature,
  normalizeDiningAddress,
  validateTripadvisorEntry,
  type AddDiningFormData,
} from "../../validation/add-dining.schema";
import {
  AI_CONFIDENCE_THRESHOLD,
  AI_FIELD_KEYS,
  PROVENANCE_TRACKED_FIELDS,
  type AiFieldStatus,
  type AiSuggestionFieldKey,
  type ProvenanceTrackedField,
} from "../dining-create.types";

function initialAiFieldStatusMap(): Record<AiSuggestionFieldKey, AiFieldStatus> {
  return AI_FIELD_KEYS.reduce(
    (acc, key) => {
      acc[key] = { state: "idle", confidenceThreshold: AI_CONFIDENCE_THRESHOLD };
      return acc;
    },
    {} as Record<AiSuggestionFieldKey, AiFieldStatus>
  );
}

function statusFromAiResult(result: DiningFieldSuggestionResponse): AiFieldStatus {
  if (result.error) {
    return {
      state: "error",
      errorMessage: result.error,
      confidence: result.confidence,
      reason: result.reason,
      sources: result.sources,
      confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
    };
  }
  if (result.suggestion == null) {
    return {
      state: "no-result",
      confidence: result.confidence,
      reason: result.reason,
      sources: result.sources,
      confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
    };
  }
  return {
    state: "suggested",
    confidence: result.confidence,
    reason: result.reason,
    sources: result.sources,
    confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
  };
}

function statusFromThrown(err: unknown): AiFieldStatus {
  return {
    state: "error",
    errorMessage: err instanceof Error ? err.message : String(err),
    confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
  };
}

interface UseDiningEnrichmentOptions {
  form: UseFormReturn<AddDiningFormData>;
}

export function useDiningEnrichment({ form }: UseDiningEnrichmentOptions) {
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [prefillOperationHours, setPrefillOperationHours] = useState<Record<string, unknown> | null>(null);
  const [prefillPhoneNumber, setPrefillPhoneNumber] = useState<string | null>(null);
  const [prefillWebsite, setPrefillWebsite] = useState<string | null>(null);
  const [prefillTripadvisorPlaceData, setPrefillTripadvisorPlaceData] =
    useState<TripadvisorPrefillFields | null>(null);
  const [aiBatchStep, setAiBatchStep] = useState<"google" | "tripadvisor" | "ai" | null>(null);
  const [verifiedAiUrls, setVerifiedAiUrls] = useState<Record<"menuUrl" | "bookingUrl", boolean>>({
    menuUrl: true,
    bookingUrl: true,
  });
  const [provenance, setProvenance] = useState<
    Partial<Record<ProvenanceTrackedField, FieldProvenance>>
  >({});
  const [prefilledValues, setPrefilledValues] = useState<Partial<Record<ProvenanceTrackedField, string>>>({});
  const [aiFieldStatus, setAiFieldStatus] = useState<Record<AiSuggestionFieldKey, AiFieldStatus>>(
    () => initialAiFieldStatusMap()
  );

  const currentPrefillSignature = buildDiningPrefillSignature(
    form.watch("name"),
    form.watch("address")
  );
  const isPrefillReady = prefillSignature !== null && prefillSignature === currentPrefillSignature;
  const prefillIsStale = prefillSignature !== null && !isPrefillReady;

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (!name) return;
      const trackedField = PROVENANCE_TRACKED_FIELDS.find((field) => field === name);
      if (!trackedField) return;
      const current = (value as Partial<AddDiningFormData>)[trackedField];
      const prefilled = prefilledValues[trackedField];
      if (prefilled === undefined) return;
      if (typeof current !== "string" || current !== prefilled) {
        setProvenance((prev) => {
          if (!(trackedField in prev)) return prev;
          const next = { ...prev };
          delete next[trackedField];
          return next;
        });
        if (trackedField === "menuUrl" || trackedField === "bookingUrl") {
          setVerifiedAiUrls((prev) =>
            prev[trackedField] ? prev : { ...prev, [trackedField]: true }
          );
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [form, prefilledValues]);

  function resetEnrichmentState() {
    setPrefillSignature(null);
    setPrefillOperationHours(null);
    setPrefillPhoneNumber(null);
    setPrefillWebsite(null);
    setPrefillTripadvisorPlaceData(null);
    setProvenance({});
    setPrefilledValues({});
    setVerifiedAiUrls({ menuUrl: true, bookingUrl: true });
    setAiFieldStatus(initialAiFieldStatusMap());
  }

  interface AiCallContext {
    name: string;
    address: string;
    prefillType: string;
    currentIdealFor: string[];
  }

  function buildAiApiContextFromState(): Record<string, unknown> {
    const ta = prefillTripadvisorPlaceData;
    return {
      placeId: form.getValues("placeId") || null,
      locationKey: form.getValues("locationKey") || null,
      district: form.getValues("district") || null,
      priceLevel: ta?.priceLevel ?? null,
      website: form.getValues("website") || prefillWebsite || null,
      tripadvisorUrl: form.getValues("tripadvisorUrl") || null,
      tripadvisorMealTypes: ta?.mealTypes ?? null,
      tripadvisorCuisines: ta?.cuisines ?? null,
      tripadvisorFeatures: ta?.features ?? null,
    };
  }

  async function callAiSuggestion(
    fieldKey: AiSuggestionFieldKey,
    ctx: AiCallContext
  ): Promise<DiningFieldSuggestionResponse> {
    return locationsApi.suggestDiningField({
      category: "dining",
      fieldKey,
      formValues: {
        name: ctx.name,
        address: ctx.address,
        type: ctx.prefillType,
        idealFor: ctx.currentIdealFor,
      },
      apiContext: buildAiApiContextFromState(),
    });
  }

  function applyAiResultToForm(
    result: DiningFieldSuggestionResponse,
    opts: {
      wantsTypeFromAi: boolean;
      nextProvenance: typeof provenance;
      nextPrefilled: typeof prefilledValues;
      onUrlSuggested?: (field: "menuUrl" | "bookingUrl") => void;
    }
  ) {
    const { wantsTypeFromAi, nextProvenance, nextPrefilled, onUrlSuggested } = opts;
    if (result.fieldKey === "idealFor" && Array.isArray(result.suggestion)) {
      form.setValue("idealFor", result.suggestion as AddDiningFormData["idealFor"], {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
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

  async function retryAiField(fieldKey: AiSuggestionFieldKey) {
    if (!isPrefillReady) return;
    const name = form.getValues("name").trim();
    const address = normalizeDiningAddress(form.getValues("address"));
    if (!name || !address) return;

    const currentTypeForm = form.getValues("type") || "";
    const wantsTypeFromAi =
      fieldKey === "type" ? true : !currentTypeForm || currentTypeForm === "other";

    setAiFieldStatus((prev) => ({
      ...prev,
      [fieldKey]: { state: "running", confidenceThreshold: AI_CONFIDENCE_THRESHOLD },
    }));

    let result: DiningFieldSuggestionResponse;
    try {
      result = await callAiSuggestion(fieldKey, {
        name,
        address,
        prefillType: currentTypeForm,
        currentIdealFor: form.getValues("idealFor") ?? [],
      });
    } catch (err) {
      setAiFieldStatus((prev) => ({ ...prev, [fieldKey]: statusFromThrown(err) }));
      return;
    }

    setAiFieldStatus((prev) => ({ ...prev, [fieldKey]: statusFromAiResult(result) }));
    if (result.suggestion == null || result.error) return;

    const nextProvenance = { ...provenance };
    const nextPrefilled = { ...prefilledValues };
    applyAiResultToForm(result, {
      wantsTypeFromAi,
      nextProvenance,
      nextPrefilled,
      onUrlSuggested: (urlField) => {
        setVerifiedAiUrls((prev) => ({ ...prev, [urlField]: false }));
      },
    });
    setProvenance(nextProvenance);
    setPrefilledValues(nextPrefilled);
  }

  async function handleGooglePrefill() {
    setPrefillError(null);
    setPrefillMessage(null);

    const isStepValid = await form.trigger(["name", "address", "tripadvisorUrl"]);
    const tripadvisorIssue = validateTripadvisorEntry({
      tripadvisorUrl: form.getValues("tripadvisorUrl") || undefined,
      noTripadvisorListing: form.getValues("noTripadvisorListing"),
    });
    if (!isStepValid || tripadvisorIssue) {
      resetEnrichmentState();
      if (tripadvisorIssue) {
        form.setError("tripadvisorUrl", { type: "manual", message: tripadvisorIssue });
      }
      setPrefillError(
        tripadvisorIssue ||
          "Enter a valid name, address, and TripAdvisor URL (or check “No TripAdvisor listing”) before running Google lookup."
      );
      return false;
    }

    const name = form.getValues("name").trim();
    const normalizedAddress = normalizeDiningAddress(form.getValues("address"));
    form.setValue("address", normalizedAddress, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });

    const operatorTripadvisorUrl = (form.getValues("tripadvisorUrl") || "").trim();
    const noTripadvisorListing = form.getValues("noTripadvisorListing");

    setIsPrefillingGoogle(true);
    setAiBatchStep(noTripadvisorListing ? "google" : "tripadvisor");

    try {
      const prefill = await locationsApi.googlePrefill("dining", {
        name,
        address: normalizedAddress,
        tripadvisorUrl: operatorTripadvisorUrl || undefined,
        noTripadvisorListing: noTripadvisorListing || undefined,
      });

      form.setValue("googleUrl", prefill.googleUrl, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("placeId", prefill.placeId, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("latitude", String(prefill.lat), { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("longitude", String(prefill.lng), { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("locationKey", prefill.locationKey || "", { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("district", prefill.district || "", { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      form.setValue("ianaTimeId", prefill.ianaTimeId || "", { shouldDirty: true, shouldValidate: true, shouldTouch: true });

      if (prefill.type) form.setValue("type", prefill.type, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      if (prefill.tripadvisorUrl) form.setValue("tripadvisorUrl", prefill.tripadvisorUrl, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      if (prefill.menuUrl) form.setValue("menuUrl", prefill.menuUrl, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      if (prefill.bookingUrl) form.setValue("bookingUrl", prefill.bookingUrl, { shouldDirty: true, shouldValidate: true, shouldTouch: true });

      setPrefillOperationHours(prefill.operationHours || null);
      setPrefillPhoneNumber(prefill.phoneNumber || null);
      setPrefillWebsite(prefill.website || null);
      setPrefillTripadvisorPlaceData(prefill.tripadvisorPlaceData || null);
      setPrefillSignature(buildDiningPrefillSignature(name, normalizedAddress));

      if (!form.getValues("title")) {
        form.setValue("title", name, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      }
      if (!form.getValues("phoneNumber") && prefill.phoneNumber) {
        form.setValue("phoneNumber", prefill.phoneNumber, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      }
      if (!form.getValues("website") && prefill.website) {
        form.setValue("website", prefill.website, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
      }

      const nextProvenance: typeof provenance = {};
      const nextPrefilled: typeof prefilledValues = {};
      for (const field of PROVENANCE_TRACKED_FIELDS) {
        const value = prefill[field];
        const raw = prefill.provenance?.[field];
        if (value && isFieldProvenance(raw)) {
          nextProvenance[field] = raw;
          nextPrefilled[field] = value;
        }
      }

      setAiBatchStep("ai");
      const wantsTypeFromAi = !prefill.type || prefill.type === "other";
      const fieldsToRun: AiSuggestionFieldKey[] = ["idealFor", "menuUrl", "bookingUrl"];
      if (wantsTypeFromAi) fieldsToRun.push("type");

      setAiFieldStatus(() => {
        const next = initialAiFieldStatusMap();
        for (const key of fieldsToRun) {
          next[key] = { state: "running", confidenceThreshold: AI_CONFIDENCE_THRESHOLD };
        }
        return next;
      });

      const aiResults = await Promise.allSettled(
        fieldsToRun.map((fieldKey) =>
          callAiSuggestion(fieldKey, {
            name,
            address: normalizedAddress,
            prefillType: prefill.type ?? "",
            currentIdealFor: form.getValues("idealFor") ?? [],
          })
        )
      );

      const nextVerifiedAiUrls: Record<"menuUrl" | "bookingUrl", boolean> = {
        menuUrl: true,
        bookingUrl: true,
      };
      const nextStatuses: Partial<Record<AiSuggestionFieldKey, AiFieldStatus>> = {};

      aiResults.forEach((settled, index) => {
        const fieldKey = fieldsToRun[index];
        if (settled.status !== "fulfilled") {
          nextStatuses[fieldKey] = statusFromThrown(settled.reason);
          return;
        }
        const result = settled.value;
        nextStatuses[fieldKey] = statusFromAiResult(result);
        if (result.suggestion == null || result.error) return;

        applyAiResultToForm(result, {
          wantsTypeFromAi,
          nextProvenance,
          nextPrefilled,
          onUrlSuggested: (urlField) => {
            nextVerifiedAiUrls[urlField] = false;
          },
        });
      });

      setAiFieldStatus((prev) => ({ ...prev, ...nextStatuses }));
      setVerifiedAiUrls(nextVerifiedAiUrls);
      setAiBatchStep(null);
      setProvenance(nextProvenance);
      setPrefilledValues(nextPrefilled);
      setPrefillMessage(
        "Google + TripAdvisor + AI suggestions complete. Review the highlighted fields before Create."
      );
      return true;
    } catch (lookupError) {
      const errorMessage =
        lookupError instanceof Error ? lookupError.message : "Google lookup failed";
      resetEnrichmentState();
      setPrefillError(errorMessage);
      return false;
    } finally {
      setIsPrefillingGoogle(false);
      setAiBatchStep(null);
    }
  }

  function acknowledgeAiUrl(field: "menuUrl" | "bookingUrl", verified: boolean) {
    setVerifiedAiUrls((prev) =>
      prev[field] === verified ? prev : { ...prev, [field]: verified }
    );
  }

  return {
    isPrefillingGoogle,
    aiBatchStep,
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
    provenance,
    setProvenance,
    prefilledValues,
    setPrefilledValues,
    verifiedAiUrls,
    aiFieldStatus,
    isPrefillReady,
    prefillIsStale,
    handleGooglePrefill,
    retryAiField,
    resetEnrichmentState,
    acknowledgeAiUrl,
    allAiUrlsVerified: verifiedAiUrls.menuUrl && verifiedAiUrls.bookingUrl,
  };
}
