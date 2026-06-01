import { useState, type Dispatch, type SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import { locationsApi } from "@client/shared/services/api";
import type { GooglePrefillResponse } from "@client/shared/services/api/types";
import {
  buildAccommodationsPrefillSignature,
  normalizeAccommodationsAddress,
  type AddAccommodationsFormData,
} from "../../validation/add-accommodations.schema";
import type { AccommodationsFormSection, ApiFilledField } from "../accommodations-create.types";
import { applyGooglePrefill } from "./accommodations-prefill";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

interface UseAccommodationsPrefillOptions {
  form: UseFormReturn<AddAccommodationsFormData>;
  isPending: boolean;
  prefillSignature: string | null;
  setPrefillSignature: Dispatch<SetStateAction<string | null>>;
  setActiveSection: Dispatch<SetStateAction<AccommodationsFormSection>>;
  setApiFilledFields: Dispatch<SetStateAction<Set<ApiFilledField>>>;
  setGooglePrefillContext: Dispatch<SetStateAction<GooglePrefillResponse | null>>;
  setPrefillMessage: Dispatch<SetStateAction<string | null>>;
  setPrefillError: Dispatch<SetStateAction<string | null>>;
  resetSuggestions: () => void;
  runAutoAiFill: (
    context: GooglePrefillResponse,
    fields: Set<ApiFilledField>
  ) => Promise<{ applied: number; failed: number; total: number }>;
  setAutoFillProgress: Dispatch<SetStateAction<import("../accommodations-create.types").AutoFillProgress | null>>;
}

export function useAccommodationsPrefill({
  form,
  isPending,
  prefillSignature,
  setPrefillSignature,
  setActiveSection,
  setApiFilledFields,
  setGooglePrefillContext,
  setPrefillMessage,
  setPrefillError,
  resetSuggestions,
  runAutoAiFill,
  setAutoFillProgress,
}: UseAccommodationsPrefillOptions) {
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const currentPrefillSignature = buildAccommodationsPrefillSignature(form.watch("name"), form.watch("address"));
  const isPrefillReady = prefillSignature !== null && prefillSignature === currentPrefillSignature;
  const prefillIsStale = prefillSignature !== null && !isPrefillReady;
  const canRunGooglePrefill = !isPrefillReady && !isPrefillingGoogle && !isPending;

  const handleGooglePrefill = async () => {
    if (isPrefillReady) {
      setPrefillMessage("Google lookup already ran for this name and address. Change name/address or clear fields to run it again.");
      setPrefillError(null);
      return;
    }

    setPrefillError(null);
    setPrefillMessage(null);
    setApiFilledFields(new Set());
    setGooglePrefillContext(null);
    resetSuggestions();

    if (!await form.trigger(["name", "address"])) {
      setPrefillSignature(null);
      setPrefillError("Enter a valid name and address before running Google lookup.");
      return;
    }

    const name = form.getValues("name").trim();
    const address = normalizeAccommodationsAddress(form.getValues("address"));
    form.setValue("address", address, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
    setIsPrefillingGoogle(true);

    try {
      const prefill = await locationsApi.googlePrefill("accommodations", { name, address });
      const { apiFilledFields, enrichmentFields } = applyGooglePrefill(form, prefill);
      setApiFilledFields(apiFilledFields);
      setGooglePrefillContext(prefill);
      setPrefillSignature(buildAccommodationsPrefillSignature(name, address));
      const autoFill = await runAutoAiFill(prefill, apiFilledFields);
      setPrefillMessage(
        `Google lookup complete. Place ID, coordinates, location key, district, time zone, phone, and website were prefilled when available.${
          enrichmentFields.length > 0 ? ` Additional enrichment filled ${enrichmentFields.join(", ")}.` : ""
        }${
          autoFill.total > 0
            ? ` AI filled ${autoFill.applied}/${autoFill.total} eligible fields${autoFill.failed > 0 ? `; ${autoFill.failed} need manual review.` : "."}`
            : ""
        }`
      );
      setActiveSection("entities");
    } catch (error) {
      setPrefillSignature(null);
      setGooglePrefillContext(null);
      setPrefillError(getErrorMessage(error));
    } finally {
      setIsPrefillingGoogle(false);
      setAutoFillProgress(null);
    }
  };

  return {
    canRunGooglePrefill,
    handleGooglePrefill,
    isPrefillingGoogle,
    isPrefillReady,
    prefillIsStale,
  };
}
