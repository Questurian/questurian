import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ImageVariantType } from "@questurian/lm-shared";
import { photoImportApi } from "@client/shared/services/api/photo-import.api";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import { createMultiVariantImages } from "@client/shared/lib/image-processing";
import { addFlowPhotoSession } from "../../lib/add-flow-photo-session";
import {
  buildCenterCropStates,
  loadImageDimensions,
} from "./photo-import-crop.utils";
import type {
  CroppedPhotoSource,
  SourceCard,
} from "./photo-import-phase.types";

interface UsePhotoCropWorkflowOptions {
  sessionId: string;
  selected: Set<string>;
  cards: Map<string, SourceCard>;
  setCards: Dispatch<SetStateAction<Map<string, SourceCard>>>;
}

export function usePhotoCropWorkflow({
  sessionId,
  selected,
  cards,
  setCards,
}: UsePhotoCropWorkflowOptions) {
  const [activeSourceName, setActiveSourceName] = useState<string | null>(null);
  const [activeSourceFile, setActiveSourceFile] = useState<File | null>(null);

  const updateCard = useCallback((
    sourceName: string,
    update: (card: SourceCard) => SourceCard
  ) => {
    setCards((current) => {
      const card = current.get(sourceName);
      if (!card) return current;
      return new Map(current).set(sourceName, update(card));
    });
  }, [setCards]);

  const fetchSourceBytes = useCallback(async (sourceName: string): Promise<File | null> => {
    updateCard(sourceName, (card) => ({
      ...card,
      uiStatus: "fetching",
      errorMessage: null,
    }));
    try {
      const blob = await photoImportApi.proxyPhotoBytes(sourceName, 1600);
      return new File([blob], `${sourceName.replace(/\//g, "_")}.jpg`, {
        type: blob.type || "image/jpeg",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch photo";
      updateCard(sourceName, (card) => ({
        ...card,
        uiStatus: "failed",
        errorMessage: message,
      }));
      return null;
    }
  }, [updateCard]);

  const openCropper = useCallback(async (sourceName: string) => {
    const file = await fetchSourceBytes(sourceName);
    if (!file) return;
    setActiveSourceName(sourceName);
    setActiveSourceFile(file);
  }, [fetchSourceBytes]);

  const closeCropper = useCallback(() => {
    setActiveSourceName(null);
    setActiveSourceFile(null);
  }, []);

  const persistVariants = useCallback(async (
    sourceName: string,
    variantFiles: ImageVariantUploadFile[],
    photographerCredit: string
  ) => {
    try {
      await addFlowPhotoSession.putSourceVariants(
        sessionId,
        sourceName,
        variantFiles.map((variant) => ({
          variantType: variant.type as ImageVariantType,
          file: variant.file,
        })),
        photographerCredit
      );
    } catch (error) {
      console.warn("[PhotoImportPhase] IDB persist failed", error);
    }
  }, [sessionId]);

  const confirmCrop = useCallback(async (
    sourceFile: File,
    variantFiles: ImageVariantUploadFile[],
    credit?: string
  ) => {
    const sourceName = activeSourceName;
    if (!sourceName) return;
    const photographerCredit = credit?.trim() || "Google";
    const cropped: CroppedPhotoSource = {
      sourceName,
      sourceFile,
      variants: variantFiles,
      photographerCredit,
    };
    updateCard(sourceName, (card) => ({
      ...card,
      uiStatus: "cropped",
      errorMessage: null,
      cropped,
    }));
    closeCropper();
    await persistVariants(sourceName, variantFiles, photographerCredit);
  }, [activeSourceName, closeCropper, persistVariants, updateCard]);

  const autoCropSource = useCallback(async (sourceName: string) => {
    const card = cards.get(sourceName);
    const file = await fetchSourceBytes(sourceName);
    if (!file) return;
    let objectUrl: string | null = null;
    try {
      const { url, width, height } = await loadImageDimensions(file);
      objectUrl = url;
      const cropStates = buildCenterCropStates(width, height);
      const variantFiles = await createMultiVariantImages(url, cropStates, file.name, 0);
      const photographerCredit = card?.authorDisplayName?.trim() || "Google";
      const cropped: CroppedPhotoSource = {
        sourceName,
        sourceFile: file,
        variants: variantFiles,
        photographerCredit,
      };
      updateCard(sourceName, (current) => ({
        ...current,
        uiStatus: "cropped",
        errorMessage: null,
        cropped,
      }));
      await persistVariants(sourceName, variantFiles, photographerCredit);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auto-crop failed";
      updateCard(sourceName, (current) => ({
        ...current,
        uiStatus: "failed",
        errorMessage: message,
      }));
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }, [cards, fetchSourceBytes, persistVariants, updateCard]);

  const autoCropAll = useCallback(async () => {
    const targets = Array.from(selected).filter((name) => {
      const card = cards.get(name);
      return card && card.uiStatus !== "cropped" && card.uiStatus !== "fetching";
    });
    for (const name of targets) {
      await autoCropSource(name);
    }
  }, [autoCropSource, cards, selected]);

  return {
    activeSourceName,
    activeSourceFile,
    openCropper,
    closeCropper,
    confirmCrop,
    autoCropSource,
    autoCropAll,
  };
}
