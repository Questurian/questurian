import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useUpdateLocation } from "@client/shared/services/api";
import type { LocationResponse } from "@client/shared/services/api/types";
import type { EditNightlifeFormData } from "../nightlife-edit.types";
import {
  buildNightlifeEditFormValues,
  buildNightlifePrefillSignature,
} from "../hydration/nightlife-edit-hydration";
import { buildNightlifeUpdatePayload } from "./build-nightlife-edit-payload";

interface UseUpdateNightlifeParams {
  form: UseFormReturn<EditNightlifeFormData>;
  locationId: number | null;
  onHydrated: (values: EditNightlifeFormData) => void;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string | null) => void;
  setPrefillSignature: (signature: string | null) => void;
}

export function useUpdateNightlife({
  form,
  locationId,
  onHydrated,
  onSuccessMessage,
  onErrorMessage,
  setPrefillSignature,
}: UseUpdateNightlifeParams) {
  const [updatedName, setUpdatedName] = useState<string | null>(null);
  const { mutate: updateLocation, isPending, error } = useUpdateLocation();

  const handleSubmit = (data: EditNightlifeFormData) => {
    if (locationId === null) {
      onErrorMessage("Invalid nightlife edit route.");
      return;
    }

    updateLocation(
      {
        category: "nightlife",
        id: locationId,
        data: buildNightlifeUpdatePayload(data),
      },
      {
        onSuccess: (response: LocationResponse) => {
          const nextValues = buildNightlifeEditFormValues(response);
          form.reset(nextValues);
          onHydrated(nextValues);
          setUpdatedName(response.title || response.source.name);
          setPrefillSignature(buildNightlifePrefillSignature(nextValues.name, nextValues.location));
          onSuccessMessage("Nightlife document updated successfully.");
          onErrorMessage(null);
        },
      }
    );
  };

  return { handleSubmit, isPending, error, updatedName };
}
