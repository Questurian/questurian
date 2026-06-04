import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { TripadvisorPrefillFields } from "@client/shared/services/api/types";
import type { FieldProvenance } from "@questurian/lm-shared";
import type { AddDiningFormData } from "../../validation/add-dining.schema";
import {
  DINING_FORM_DEFAULT_VALUES,
  type ProvenanceTrackedField,
} from "../dining-create.types";
import {
  readDiningDraftFromStorage,
  writeDiningDraftToStorage,
} from "./dining-draft-storage";

interface UseDiningDraftOptions {
  form: UseFormReturn<AddDiningFormData>;
  prefillSignature: string | null;
  prefillOperationHours: Record<string, unknown> | null;
  prefillPhoneNumber: string | null;
  prefillWebsite: string | null;
  prefillTripadvisorPlaceData: TripadvisorPrefillFields | null;
  provenance: Partial<Record<ProvenanceTrackedField, FieldProvenance>>;
  prefilledValues: Partial<Record<ProvenanceTrackedField, string>>;
  setPrefillSignature: Dispatch<SetStateAction<string | null>>;
  setPrefillOperationHours: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  setPrefillPhoneNumber: Dispatch<SetStateAction<string | null>>;
  setPrefillWebsite: Dispatch<SetStateAction<string | null>>;
  setPrefillTripadvisorPlaceData: Dispatch<SetStateAction<TripadvisorPrefillFields | null>>;
  setProvenance: Dispatch<SetStateAction<Partial<Record<ProvenanceTrackedField, FieldProvenance>>>>;
  setPrefilledValues: Dispatch<SetStateAction<Partial<Record<ProvenanceTrackedField, string>>>>;
  setPrefillMessage: Dispatch<SetStateAction<string | null>>;
  setPrefillError: Dispatch<SetStateAction<string | null>>;
}

export function useDiningDraft({
  form,
  prefillSignature,
  prefillOperationHours,
  prefillPhoneNumber,
  prefillWebsite,
  prefillTripadvisorPlaceData,
  provenance,
  prefilledValues,
  setPrefillSignature,
  setPrefillOperationHours,
  setPrefillPhoneNumber,
  setPrefillWebsite,
  setPrefillTripadvisorPlaceData,
  setProvenance,
  setPrefilledValues,
  setPrefillMessage,
  setPrefillError,
}: UseDiningDraftOptions) {
  const hasHydratedDraftRef = useRef(false);

  useEffect(() => {
    const draft = readDiningDraftFromStorage();
    if (!draft) {
      hasHydratedDraftRef.current = true;
      return;
    }

    form.reset(draft.formValues);
    setPrefillSignature(draft.prefillSignature);
    setPrefillOperationHours(draft.prefillOperationHours);
    setPrefillPhoneNumber(draft.prefillPhoneNumber);
    setPrefillWebsite(draft.prefillWebsite);
    setPrefillTripadvisorPlaceData(draft.prefillTripadvisorPlaceData);
    setProvenance(draft.provenance);
    setPrefilledValues(draft.prefilledValues);
    setPrefillMessage("Restored unsaved draft from your previous session.");
    setPrefillError(null);
    hasHydratedDraftRef.current = true;
  }, [
    form,
    setPrefillError,
    setPrefillMessage,
    setPrefillOperationHours,
    setPrefillPhoneNumber,
    setPrefillSignature,
    setPrefillTripadvisorPlaceData,
    setPrefillWebsite,
    setPrefilledValues,
    setProvenance,
  ]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      if (!hasHydratedDraftRef.current) return;

      writeDiningDraftToStorage({
        formValues: {
          ...DINING_FORM_DEFAULT_VALUES,
          ...(value as Partial<AddDiningFormData>),
        },
        prefillSignature,
        prefillOperationHours,
        prefillPhoneNumber,
        prefillWebsite,
        prefillTripadvisorPlaceData,
        provenance,
        prefilledValues,
      });
    });

    return () => subscription.unsubscribe();
  }, [
    form,
    prefillSignature,
    prefillOperationHours,
    prefillPhoneNumber,
    prefillWebsite,
    prefillTripadvisorPlaceData,
    provenance,
    prefilledValues,
  ]);

  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;

    writeDiningDraftToStorage({
      formValues: form.getValues(),
      prefillSignature,
      prefillOperationHours,
      prefillPhoneNumber,
      prefillWebsite,
      prefillTripadvisorPlaceData,
      provenance,
      prefilledValues,
    });
  }, [
    form,
    prefillSignature,
    prefillOperationHours,
    prefillPhoneNumber,
    prefillWebsite,
    prefillTripadvisorPlaceData,
    provenance,
    prefilledValues,
  ]);
}
