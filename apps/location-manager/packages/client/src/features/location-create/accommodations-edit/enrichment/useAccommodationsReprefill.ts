import { useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { locationsApi } from "@client/shared/services/api";
import {
  buildAccommodationsPrefillSignature,
  normalizeAccommodationsAddress,
  type AddAccommodationsFormData,
} from "../../validation/add-accommodations.schema";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

const SET_OPTIONS = { shouldDirty: true, shouldValidate: true, shouldTouch: true } as const;

interface UseAccommodationsReprefillParams {
  form: UseFormReturn<AddAccommodationsFormData>;
  prefillSignature: string | null;
  setPrefillSignature: (signature: string | null) => void;
}

/** Re-runs Google lookup for an existing location and refreshes the entity fields. */
export function useAccommodationsReprefill({
  form,
  prefillSignature,
  setPrefillSignature,
}: UseAccommodationsReprefillParams) {
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  const prefillIsStale = useMemo(() => {
    if (!prefillSignature) return false;
    const current = buildAccommodationsPrefillSignature(form.watch("name"), form.watch("address"));
    return current !== prefillSignature;
  }, [form, prefillSignature]);

  const handleGooglePrefill = async () => {
    setPrefillError(null);
    setPrefillMessage(null);

    const isStepValid = await form.trigger(["name", "address"]);
    if (!isStepValid) {
      setPrefillError("Enter a valid name and address before running Google lookup.");
      return;
    }

    const name = form.getValues("name").trim();
    const normalizedAddress = normalizeAccommodationsAddress(form.getValues("address"));
    form.setValue("address", normalizedAddress, SET_OPTIONS);

    setIsPrefillingGoogle(true);
    try {
      const prefill = await locationsApi.googlePrefill("accommodations", {
        name,
        address: normalizedAddress,
      });

      form.setValue("placeId", prefill.placeId, SET_OPTIONS);
      form.setValue("latitude", String(prefill.lat), SET_OPTIONS);
      form.setValue("longitude", String(prefill.lng), SET_OPTIONS);
      form.setValue("googleUrl", prefill.googleUrl, SET_OPTIONS);
      form.setValue("googleMapsUrl", prefill.googleUrl, SET_OPTIONS);
      form.setValue("locationKey", prefill.locationKey || "", SET_OPTIONS);
      form.setValue("district", prefill.district || "", SET_OPTIONS);
      form.setValue("ianaTimeId", prefill.ianaTimeId || "", SET_OPTIONS);
      if (prefill.phoneNumber) {
        form.setValue("phone", prefill.phoneNumber, SET_OPTIONS);
      }
      if (prefill.website) {
        form.setValue("websiteUrl", prefill.website, SET_OPTIONS);
      }

      setPrefillSignature(buildAccommodationsPrefillSignature(name, normalizedAddress));
      setPrefillMessage(
        "Google lookup complete. Place ID, coordinates, location key, district, time zone, phone, and website were refreshed."
      );
    } catch (lookupError) {
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
    handleGooglePrefill,
  };
}
