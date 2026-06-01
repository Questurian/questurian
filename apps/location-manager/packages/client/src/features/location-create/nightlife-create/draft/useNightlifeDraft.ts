import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AddNightlifeFormData } from "../../validation/add-nightlife.schema";
import { NIGHTLIFE_FORM_DEFAULT_VALUES } from "../nightlife-create.types";
import {
  readNightlifeDraftFromStorage,
  writeNightlifeDraftToStorage,
} from "./nightlife-draft-storage";

interface UseNightlifeDraftOptions {
  form: UseFormReturn<AddNightlifeFormData>;
  prefillSignature: string | null;
  setPrefillSignature: Dispatch<SetStateAction<string | null>>;
  setPrefillMessage: Dispatch<SetStateAction<string | null>>;
  setPrefillError: Dispatch<SetStateAction<string | null>>;
}

export function useNightlifeDraft({
  form,
  prefillSignature,
  setPrefillSignature,
  setPrefillMessage,
  setPrefillError,
}: UseNightlifeDraftOptions) {
  const hasHydratedDraftRef = useRef(false);

  useEffect(() => {
    const draft = readNightlifeDraftFromStorage();
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
      writeNightlifeDraftToStorage({
        formValues: {
          ...NIGHTLIFE_FORM_DEFAULT_VALUES,
          ...(value as Partial<AddNightlifeFormData>),
        },
        prefillSignature,
      });
    });

    return () => subscription.unsubscribe();
  }, [form, prefillSignature]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;
    writeNightlifeDraftToStorage({ formValues: form.getValues(), prefillSignature });
  }, [form, prefillSignature]);
}
