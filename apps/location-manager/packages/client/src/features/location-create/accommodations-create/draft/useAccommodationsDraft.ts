import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import { ACCOMMODATIONS_FORM_DEFAULT_VALUES } from "../accommodations-create.types";
import {
  readAccommodationsDraftFromStorage,
  writeAccommodationsDraftToStorage,
} from "./accommodations-draft-storage";

interface UseAccommodationsDraftOptions {
  form: UseFormReturn<AddAccommodationsFormData>;
  prefillSignature: string | null;
  setPrefillSignature: Dispatch<SetStateAction<string | null>>;
  setPrefillMessage: Dispatch<SetStateAction<string | null>>;
  setPrefillError: Dispatch<SetStateAction<string | null>>;
}

export function useAccommodationsDraft({
  form,
  prefillSignature,
  setPrefillSignature,
  setPrefillMessage,
  setPrefillError,
}: UseAccommodationsDraftOptions) {
  const hasHydratedDraftRef = useRef(false);

  useEffect(() => {
    const draft = readAccommodationsDraftFromStorage();
    if (!draft) {
      hasHydratedDraftRef.current = true;
      return;
    }

    form.reset(draft.formValues);
    setPrefillSignature(draft.prefillSignature);
    setPrefillMessage("Restored unsaved draft from your previous session.");
    setPrefillError(null);
    hasHydratedDraftRef.current = true;
  }, [form, setPrefillError, setPrefillMessage, setPrefillSignature]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      if (!hasHydratedDraftRef.current) return;
      writeAccommodationsDraftToStorage({
        formValues: {
          ...ACCOMMODATIONS_FORM_DEFAULT_VALUES,
          ...(value as Partial<AddAccommodationsFormData>),
        },
        prefillSignature,
      });
    });

    return () => subscription.unsubscribe();
  }, [form, prefillSignature]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;
    writeAccommodationsDraftToStorage({
      formValues: form.getValues(),
      prefillSignature,
    });
  }, [form, prefillSignature]);
}
