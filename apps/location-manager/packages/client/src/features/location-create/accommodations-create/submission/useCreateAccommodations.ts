import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { locationsApi } from "@client/shared/services/api";
import { useCreateLocation } from "@client/shared/services/api/hooks";
import type { PhotoImportSessionState } from "../../components/PhotoImportPhase";
import { addFlowPhotoSession } from "../../lib/add-flow-photo-session";
import {
  addAccommodationsSubmitSchema,
  type AddAccommodationsFormData,
} from "../../validation/add-accommodations.schema";
import { buildAccommodationsCreatePayload } from "./build-accommodations-create-payload";

interface UseCreateAccommodationsOptions {
  prefillSignature: string | null;
  photoSession: PhotoImportSessionState | null;
  onValidationError: (message: string) => void;
  onSuccess: (name: string) => void;
}

export function useCreateAccommodations({
  prefillSignature,
  photoSession,
  onValidationError,
  onSuccess,
}: UseCreateAccommodationsOptions) {
  const navigate = useNavigate();
  const { mutate: createLocation, isPending, error } = useCreateLocation();
  const [isCreatingWithPhotos, setIsCreatingWithPhotos] = useState(false);
  const [photoSubmitError, setPhotoSubmitError] = useState<Error | null>(null);

  const finalizeSuccess = (response: { id: number; source: { name: string }; title?: string | null }) =>
    onSuccess(response.title || response.source.name);

  const onSubmit = (data: AddAccommodationsFormData) => {
    const validation = addAccommodationsSubmitSchema.safeParse({ prefillSignature, formValues: data });
    if (!validation.success) {
      onValidationError(validation.error.issues[0]?.message || "Run Name + Address Google lookup before creating the accommodations document.");
      return;
    }

    const payload = buildAccommodationsCreatePayload(data);
    if (!photoSession || photoSession.cropped.length === 0) {
      createLocation(payload, { onSuccess: finalizeSuccess });
      return;
    }

    // ADR-0007: atomic multipart Create with all cropped variants attached.
    setIsCreatingWithPhotos(true);
    setPhotoSubmitError(null);
    void (async () => {
      try {
        const response = await locationsApi.createLocationWithPhotos(
          payload,
          photoSession.cropped.map((crop) => ({
            sourceName: crop.sourceName,
            sourceFile: crop.sourceFile,
            variants: crop.variants.map((variant) => ({ type: variant.type as string, file: variant.file })),
            photographerCredit: crop.photographerCredit,
          }))
        );
        await addFlowPhotoSession.clearSession(photoSession.sessionId).catch(() => undefined);
        finalizeSuccess(response);
        navigate(`/edit/accommodations/${response.id}`);
      } catch (error) {
        const submitError = error instanceof Error ? error : new Error("Create with photos failed");
        setPhotoSubmitError(submitError);
        console.error("[AddAccommodationsLocation] createLocationWithPhotos failed", error);
      } finally {
        setIsCreatingWithPhotos(false);
      }
    })();
  };

  return { error, isCreatingWithPhotos, isPending, onSubmit, photoSubmitError };
}
