import { useCreateLocation } from "@client/shared/services/api/hooks";
import type { AddNightlifeFormData } from "../../validation/add-nightlife.schema";
import { buildNightlifeCreatePayload } from "./build-nightlife-create-payload";

interface UseCreateNightlifeOptions {
  isPrefillReady: boolean;
  onValidationError: (message: string) => void;
  onSuccess: (name: string) => void;
}

export function useCreateNightlife({
  isPrefillReady,
  onValidationError,
  onSuccess,
}: UseCreateNightlifeOptions) {
  const { mutate: createLocation, isPending, error } = useCreateLocation();

  const onSubmit = (data: AddNightlifeFormData) => {
    if (!isPrefillReady) {
      onValidationError("Run Name + Address Google lookup before creating the nightlife document.");
      return;
    }
    createLocation(buildNightlifeCreatePayload(data), {
      onSuccess: (response) => onSuccess(response.title || response.source.name),
    });
  };

  return { error, isPending, onSubmit };
}
