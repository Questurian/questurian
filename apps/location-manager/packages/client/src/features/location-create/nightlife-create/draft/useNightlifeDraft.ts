import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
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
  const prefillSignatureRef = useRef(prefillSignature);
  const lastPersistedDraftRef = useRef<string | null>(null);

  useEffect(() => {
    prefillSignatureRef.current = prefillSignature;
  }, [prefillSignature]);

  const persistDraft = useCallback((formValues: AddNightlifeFormData, signature: string | null) => {
    const draft = { formValues, prefillSignature: signature };
    const snapshot = JSON.stringify(draft);
    if (snapshot === lastPersistedDraftRef.current) return;
    lastPersistedDraftRef.current = snapshot;
    writeNightlifeDraftToStorage(draft);
  }, []);

  useEffect(() => {
    const draft = readNightlifeDraftFromStorage();
    if (!draft) {
      hasHydratedDraftRef.current = true;
      return;
    }

    form.reset(draft.formValues);
    setPrefillSignature(draft.prefillSignature);
    prefillSignatureRef.current = draft.prefillSignature;
    lastPersistedDraftRef.current = JSON.stringify(draft);
    setPrefillMessage("Restored unsaved draft from your previous session.");
    setPrefillError(null);
    hasHydratedDraftRef.current = true;
  }, [form, setPrefillError, setPrefillMessage, setPrefillSignature]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      if (!hasHydratedDraftRef.current) return;
      persistDraft(
        {
          ...NIGHTLIFE_FORM_DEFAULT_VALUES,
          ...(value as Partial<AddNightlifeFormData>),
        },
        prefillSignatureRef.current
      );
    });

    return () => subscription.unsubscribe();
  }, [form, persistDraft]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;
    persistDraft(form.getValues(), prefillSignature);
  }, [form, persistDraft, prefillSignature]);
}
