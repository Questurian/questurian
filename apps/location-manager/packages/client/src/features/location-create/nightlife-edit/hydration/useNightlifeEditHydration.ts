import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { LocationResponse } from "@client/shared/services/api/types";
import type { EditNightlifeFormData } from "../nightlife-edit.types";
import {
  buildNightlifeEditFormValues,
  buildNightlifePrefillSignature,
} from "./nightlife-edit-hydration";

interface UseNightlifeEditHydrationParams {
  form: UseFormReturn<EditNightlifeFormData>;
  location: LocationResponse | undefined;
  setPrefillSignature: (signature: string | null) => void;
  clearPrefillFeedback: () => void;
}

export function useNightlifeEditHydration({
  form,
  location,
  setPrefillSignature,
  clearPrefillFeedback,
}: UseNightlifeEditHydrationParams) {
  useEffect(() => {
    if (!location) return;
    const values = buildNightlifeEditFormValues(location);
    form.reset(values);
    setPrefillSignature(buildNightlifePrefillSignature(values.name, values.location));
    clearPrefillFeedback();
  }, [location, form, setPrefillSignature, clearPrefillFeedback]);
}
