import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { LocationResponse } from "@client/shared/services/api/types";
import {
  buildAccommodationsPrefillSignature,
  type AddAccommodationsFormData,
} from "../../validation/add-accommodations.schema";
import { buildAccommodationsEditFormValues } from "./accommodations-edit-hydration";

interface UseAccommodationsEditHydrationParams {
  form: UseFormReturn<AddAccommodationsFormData>;
  location: LocationResponse | undefined;
  setPrefillSignature: (signature: string | null) => void;
}

/** Resets the form to the saved location's values once it loads. */
export function useAccommodationsEditHydration({
  form,
  location,
  setPrefillSignature,
}: UseAccommodationsEditHydrationParams) {
  useEffect(() => {
    if (!location) return;
    const values = buildAccommodationsEditFormValues(location);
    form.reset(values);
    setPrefillSignature(buildAccommodationsPrefillSignature(values.name, values.address));
  }, [location, form, setPrefillSignature]);
}
