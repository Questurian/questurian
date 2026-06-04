import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import {
  useCreateLocation,
  useLocationTypes,
} from "@client/shared/services/api/hooks";
import { locationsApi } from "@client/shared/services/api";
import { addFlowPhotoSession } from "../lib/add-flow-photo-session";
import type { CroppedPhotoSource } from "../components/PhotoImportPhase";
import {
  addDiningSchema,
  addDiningSubmitSchema,
  type AddDiningFormData,
} from "../validation/add-dining.schema";
import {
  DINING_FORM_DEFAULT_VALUES,
  type CreatedDiningLocation,
  type DiningPhase,
} from "../dining-create/dining-create.types";
import { useDiningDraft } from "../dining-create/draft/useDiningDraft";
import { clearDiningDraftFromStorage } from "../dining-create/draft/dining-draft-storage";
import { useDiningEnrichment } from "../dining-create/enrichment/useDiningEnrichment";
import { buildDiningCreatePayload } from "../dining-create/submission/build-dining-create-payload";

export type {
  AiFieldStatus,
  AiFieldStatusState,
  AiSuggestionFieldKey,
  DiningPhase,
} from "../dining-create/dining-create.types";

export function useAddDiningFlow() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<DiningPhase>("add");
  const [createdLocation, setCreatedLocation] = useState<CreatedDiningLocation | null>(null);
  const { mutate: createLocation, isPending: isCreating, error: createError } = useCreateLocation();
  const [photoSubmitError, setPhotoSubmitError] = useState<Error | null>(null);
  const [isCreatingWithPhotos, setIsCreatingWithPhotos] = useState(false);
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes("dining");

  const addForm = useForm<AddDiningFormData>({
    resolver: zodResolver(addDiningSchema),
    defaultValues: DINING_FORM_DEFAULT_VALUES,
    mode: "onChange",
  });

  const enrichment = useDiningEnrichment({ form: addForm });

  useDiningDraft({
    form: addForm,
    prefillSignature: enrichment.prefillSignature,
    prefillOperationHours: enrichment.prefillOperationHours,
    prefillPhoneNumber: enrichment.prefillPhoneNumber,
    prefillWebsite: enrichment.prefillWebsite,
    prefillTripadvisorPlaceData: enrichment.prefillTripadvisorPlaceData,
    provenance: enrichment.provenance,
    prefilledValues: enrichment.prefilledValues,
    setPrefillSignature: enrichment.setPrefillSignature,
    setPrefillOperationHours: enrichment.setPrefillOperationHours,
    setPrefillPhoneNumber: enrichment.setPrefillPhoneNumber,
    setPrefillWebsite: enrichment.setPrefillWebsite,
    setPrefillTripadvisorPlaceData: enrichment.setPrefillTripadvisorPlaceData,
    setProvenance: enrichment.setProvenance,
    setPrefilledValues: enrichment.setPrefilledValues,
    setPrefillMessage: enrichment.setPrefillMessage,
    setPrefillError: enrichment.setPrefillError,
  });

  function onCreateSuccess(response: Awaited<ReturnType<typeof locationsApi.createLocation>>) {
    setCreatedLocation({
      id: response.id,
      category: response.category,
      name: response.source.name,
      title: response.title || response.source.name,
      phoneNumber: response.contact?.phoneNumber || undefined,
      website: response.contact?.website || undefined,
      tripadvisorUrl: response.tripadvisorUrl,
      menuUrl: response.menuUrl,
      bookingUrl: response.bookingUrl,
      placeId: response.placeId,
    });
    addForm.reset(DINING_FORM_DEFAULT_VALUES);
    enrichment.resetEnrichmentState();
    enrichment.setPrefillMessage(null);
    enrichment.setPrefillError(null);
    clearDiningDraftFromStorage();
  }

  function handleAddDining(
    data: AddDiningFormData,
    photoSession?: { sessionId: string; cropped: CroppedPhotoSource[] }
  ) {
    const submitValidation = addDiningSubmitSchema.safeParse({
      prefillSignature: enrichment.prefillSignature,
      formValues: data,
    });

    if (!submitValidation.success) {
      const firstIssue = submitValidation.error.issues[0]?.message;
      enrichment.setPrefillError(
        firstIssue || "Run Google lookup before creating the dining document."
      );
      return;
    }

    const payload = buildDiningCreatePayload(data, {
      prefillOperationHours: enrichment.prefillOperationHours,
      prefillPhoneNumber: enrichment.prefillPhoneNumber,
      prefillWebsite: enrichment.prefillWebsite,
      prefillTripadvisorPlaceData: enrichment.prefillTripadvisorPlaceData,
      provenance: enrichment.provenance,
    });
    const hasPhotos = !!photoSession && photoSession.cropped.length > 0;

    if (!hasPhotos) {
      createLocation(payload, {
        onSuccess: (response) => {
          onCreateSuccess(response);
          setPhase("success");
        },
      });
      return;
    }

    setIsCreatingWithPhotos(true);
    setPhotoSubmitError(null);
    void (async () => {
      try {
        const response = await locationsApi.createLocationWithPhotos(
          payload,
          photoSession!.cropped.map((c) => ({
            sourceName: c.sourceName,
            sourceFile: c.sourceFile,
            variants: c.variants.map((v) => ({ type: v.type as string, file: v.file })),
            photographerCredit: c.photographerCredit,
          }))
        );
        onCreateSuccess(response);
        await addFlowPhotoSession.clearSession(photoSession!.sessionId).catch(() => undefined);
        navigate("/");
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Create with photos failed");
        setPhotoSubmitError(error);
        console.error("[useAddDiningFlow] createLocationWithPhotos failed", err);
      } finally {
        setIsCreatingWithPhotos(false);
      }
    })();
  }

  function handleReset() {
    setPhase("add");
    setCreatedLocation(null);
    addForm.reset(DINING_FORM_DEFAULT_VALUES);
    enrichment.resetEnrichmentState();
    enrichment.setPrefillMessage(null);
    enrichment.setPrefillError(null);
    clearDiningDraftFromStorage();
  }

  function navigateHome() {
    navigate("/");
  }

  return {
    phase,
    setPhase,
    createdLocation,
    addForm,
    locationTypes,
    isLoadingTypes,
    isCreating: isCreating || isCreatingWithPhotos,
    createError: photoSubmitError ?? createError,
    isPrefillingGoogle: enrichment.isPrefillingGoogle,
    aiBatchStep: enrichment.aiBatchStep,
    prefillMessage: enrichment.prefillMessage,
    prefillError: enrichment.prefillError,
    prefillSignature: enrichment.prefillSignature,
    isPrefillReady: enrichment.isPrefillReady,
    prefillIsStale: enrichment.prefillIsStale,
    handleGooglePrefill: enrichment.handleGooglePrefill,
    handleAddDining,
    handleReset,
    navigateHome,
    provenance: enrichment.provenance,
    verifiedAiUrls: enrichment.verifiedAiUrls,
    acknowledgeAiUrl: enrichment.acknowledgeAiUrl,
    allAiUrlsVerified: enrichment.allAiUrlsVerified,
    aiFieldStatus: enrichment.aiFieldStatus,
    retryAiField: enrichment.retryAiField,
  };
}
