import type { UseFormReturn } from "react-hook-form";
import { locationsApi } from "@client/shared/services/api";
import type { DiningFieldSuggestionResponse } from "@client/shared/services/api/types";
import { isFieldProvenance } from "@questurian/lm-shared";
import { initAiUrlAck, markAiUrlSuggested } from "../../autofill/ai-url-ack";
import {
  buildDiningPrefillSignature,
  normalizeDiningAddress,
  validateTripadvisorEntry,
  type AddDiningFormData,
} from "../../validation/add-dining.schema";
import {
  AI_CONFIDENCE_THRESHOLD,
  PROVENANCE_TRACKED_FIELDS,
  type AiFieldStatus,
  type AiSuggestionFieldKey,
} from "../dining-create.types";
import {
  applyDiningAiResultToForm,
  callDiningAiSuggestion,
  initialAiFieldStatusMap,
  statusFromAiResult,
  statusFromThrown,
  type AiCallContext,
} from "./diningAiSuggestions";
import {
  AI_URL_ACK_FIELDS,
  useDiningEnrichmentState,
} from "./useDiningEnrichmentState";

interface UseDiningEnrichmentOptions {
  form: UseFormReturn<AddDiningFormData>;
}

export function useDiningEnrichment({ form }: UseDiningEnrichmentOptions) {
  const state = useDiningEnrichmentState(form);
  const {
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
    prefillIsStale,
    resetEnrichmentState,
    acknowledgeAiUrl,
    allAiUrlsVerified,
  } = state;

  const callAiSuggestion = (
    fieldKey: AiSuggestionFieldKey,
    context: AiCallContext
  ) =>
    callDiningAiSuggestion(
      form,
      prefillWebsite,
      prefillTripadvisorPlaceData,
      fieldKey,
      context
    );

  const applyAiResultToForm = (
    ...args: Parameters<typeof applyDiningAiResultToForm> extends [
      unknown,
      ...infer Rest,
    ]
      ? Rest
      : never
  ) => applyDiningAiResultToForm(form, ...args);

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
        setVerifiedAiUrls((prev) => markAiUrlSuggested(prev, urlField));
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

      let nextVerifiedAiUrls = initAiUrlAck(AI_URL_ACK_FIELDS);
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
            nextVerifiedAiUrls = markAiUrlSuggested(nextVerifiedAiUrls, urlField);
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
    allAiUrlsVerified,
  };
}
