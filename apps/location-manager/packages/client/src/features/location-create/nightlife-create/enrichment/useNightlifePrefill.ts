import { useState, type Dispatch, type SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import { locationsApi } from "@client/shared/services/api";
import type { AddNightlifeFormData } from "../../validation/add-nightlife.schema";
import {
  buildNightlifePrefillSignature,
  normalizeNightlifeAddress,
  type NightlifeFormSection,
} from "../nightlife-create.types";

interface UseNightlifePrefillOptions {
  form: UseFormReturn<AddNightlifeFormData>;
  isPending: boolean;
  setActiveSection: Dispatch<SetStateAction<NightlifeFormSection>>;
  setPrefillSignature: Dispatch<SetStateAction<string | null>>;
  setPrefillMessage: Dispatch<SetStateAction<string | null>>;
  setPrefillError: Dispatch<SetStateAction<string | null>>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export function useNightlifePrefill({
  form,
  isPending,
  setActiveSection,
  setPrefillSignature,
  setPrefillMessage,
  setPrefillError,
}: UseNightlifePrefillOptions) {
  const [isPrefillingGoogle, setIsPrefillingGoogle] = useState(false);

  const handleGooglePrefill = async () => {
    setPrefillError(null);
    setPrefillMessage(null);
    const isStepValid = await form.trigger(["name", "location"]);
    if (!isStepValid) {
      setPrefillSignature(null);
      setPrefillError("Enter a valid name and address before running Google lookup.");
      return;
    }

    const name = form.getValues("name").trim();
    const address = normalizeNightlifeAddress(form.getValues("location"));
    form.setValue("location", address, { shouldDirty: true, shouldValidate: true, shouldTouch: true });
    setIsPrefillingGoogle(true);

    try {
      const prefill = await locationsApi.googlePrefill("nightlife", { name, address });
      const values: Partial<AddNightlifeFormData> = {
        placeId: prefill.placeId,
        latitude: String(prefill.lat),
        longitude: String(prefill.lng),
        googleUrl: prefill.googleUrl,
        locationKey: prefill.locationKey || "",
        district: prefill.district || "",
        ianaTimeId: prefill.ianaTimeId || "",
        ...(prefill.phoneNumber ? { phone: prefill.phoneNumber } : {}),
        ...(prefill.website ? { website: prefill.website } : {}),
        ...(prefill.operationHours ? { hours: JSON.stringify(prefill.operationHours, null, 2) } : {}),
      };
      for (const [field, value] of Object.entries(values)) {
        form.setValue(field as keyof AddNightlifeFormData, value, {
          shouldDirty: true,
          shouldValidate: true,
          shouldTouch: true,
        });
      }
      setPrefillSignature(buildNightlifePrefillSignature(name, address));
      setPrefillMessage("Google lookup complete. Place ID, coordinates, location key, district, time zone, phone, website, and hours were prefilled when available.");
      setActiveSection("entities");
    } catch (error) {
      setPrefillSignature(null);
      setPrefillError(getErrorMessage(error));
    } finally {
      setIsPrefillingGoogle(false);
    }
  };

  return { handleGooglePrefill, isPrefillingGoogle, isPending };
}
