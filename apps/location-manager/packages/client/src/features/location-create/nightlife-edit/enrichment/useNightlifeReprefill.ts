import { useCallback, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { locationsApi } from "@client/shared/services/api";
import type { EditNightlifeFormData } from "../nightlife-edit.types";
import {
  buildNightlifePrefillSignature,
  normalizeNightlifeAddress,
} from "../hydration/nightlife-edit-hydration";

const SET_OPTIONS = { shouldDirty: true, shouldValidate: true, shouldTouch: true } as const;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

interface UseNightlifeReprefillParams {
  form: UseFormReturn<EditNightlifeFormData>;
  prefillSignature: string | null;
  setPrefillSignature: (signature: string | null) => void;
}

export function useNightlifeReprefill({
  form,
  prefillSignature,
  setPrefillSignature,
}: UseNightlifeReprefillParams) {
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  const prefillIsStale = useMemo(() => {
    if (!prefillSignature) return false;
    return buildNightlifePrefillSignature(form.watch("name"), form.watch("location")) !== prefillSignature;
  }, [form, prefillSignature]);

  const clearPrefillFeedback = useCallback(() => {
    setPrefillMessage(null);
    setPrefillError(null);
  }, []);

  const handleGooglePrefill = async () => {
    clearPrefillFeedback();

    const isStepValid = await form.trigger(["name", "location"]);
    if (!isStepValid) {
      setPrefillSignature(null);
      setPrefillError("Enter a valid name and address before running Google lookup.");
      return;
    }

    const name = form.getValues("name").trim();
    const normalizedAddress = normalizeNightlifeAddress(form.getValues("location"));
    form.setValue("location", normalizedAddress, SET_OPTIONS);

    setIsPrefillingGoogle(true);
    try {
      const prefill = await locationsApi.googlePrefill("nightlife", {
        name,
        address: normalizedAddress,
      });

      form.setValue("placeId", prefill.placeId, SET_OPTIONS);
      form.setValue("latitude", String(prefill.lat), SET_OPTIONS);
      form.setValue("longitude", String(prefill.lng), SET_OPTIONS);
      form.setValue("googleUrl", prefill.googleUrl, SET_OPTIONS);
      form.setValue("locationKey", prefill.locationKey || "", SET_OPTIONS);
      form.setValue("district", prefill.district || "", SET_OPTIONS);
      form.setValue("ianaTimeId", prefill.ianaTimeId || "", SET_OPTIONS);
      if (prefill.phoneNumber) form.setValue("phone", prefill.phoneNumber, SET_OPTIONS);
      if (prefill.website) form.setValue("website", prefill.website, SET_OPTIONS);
      if (prefill.operationHours) {
        form.setValue("hours", JSON.stringify(prefill.operationHours, null, 2), SET_OPTIONS);
      }

      setPrefillSignature(buildNightlifePrefillSignature(name, normalizedAddress));
      setPrefillMessage(
        "Google lookup complete. Place ID, location key, district, time zone, phone, website, and hours were refreshed when available."
      );
    } catch (lookupError) {
      setPrefillSignature(null);
      setPrefillError(getErrorMessage(lookupError));
    } finally {
      setIsPrefillingGoogle(false);
    }
  };

  return {
    isPrefillingGoogle,
    prefillMessage,
    prefillError,
    prefillIsStale,
    clearPrefillFeedback,
    setPrefillMessage,
    setPrefillError,
    handleGooglePrefill,
  };
}
