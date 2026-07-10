import { useState } from "react";
import {
  useDeleteStagedSource,
  useRetryStagedSource,
  useStagedSources,
  useStartPhotoImport,
  type StagedSourceSnapshot,
} from "@client/shared/services/api";
import { useGooglePhotoImportEnabled } from "@client/shared/services/api/hooks";
import { useReplaceUploadVariants } from "@client/shared/services/api/hooks/useReplaceUploadVariants";
import { useGenerateAltText } from "@client/shared/services/api/hooks/useGenerateAltText";
import { useToast } from "@client/shared/hooks/useToast";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import type { LocationCategory, PhotoImportStartPhoto } from "@questurian/lm-shared";
import { getFileNameFromPath, toImageApiPath } from "./photoImportPanel.utils";

type CropModalState = {
  isOpen: boolean;
  uploadId: number | null;
  file: File | null;
  altText?: string;
};

const CLOSED_CROP_STATE: CropModalState = {
  isOpen: false,
  uploadId: null,
  file: null,
  altText: undefined,
};

type AltReviewState = {
  isOpen: boolean;
  uploadId: number | null;
  file: File | null;
  generatedText: string;
  error: string | null;
};

const CLOSED_ALT_REVIEW_STATE: AltReviewState = {
  isOpen: false,
  uploadId: null,
  file: null,
  generatedText: "",
  error: null,
};

type UsePhotoImportPanelOptions = {
  locationId: number;
  category: LocationCategory;
  hasActiveInstagramStaging?: boolean;
};

export function usePhotoImportPanel({ locationId, category, hasActiveInstagramStaging }: UsePhotoImportPanelOptions) {
  const { showToast } = useToast();
  const { enabled: photoImportEnabled } = useGooglePhotoImportEnabled();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cropState, setCropState] = useState<CropModalState>(CLOSED_CROP_STATE);
  const [altReviewState, setAltReviewState] = useState<AltReviewState>(CLOSED_ALT_REVIEW_STATE);
  const [cachedAltTexts, setCachedAltTexts] = useState<Record<number, string>>({});
  const [loadingSourceId, setLoadingSourceId] = useState<number | null>(null);
  const [deleteConfirmSource, setDeleteConfirmSource] = useState<StagedSourceSnapshot | null>(null);

  const sourcesQuery = useStagedSources(locationId, { pollForIncoming: hasActiveInstagramStaging });
  const startImport = useStartPhotoImport();
  const retryStaged = useRetryStagedSource();
  const deleteStaged = useDeleteStagedSource();
  const generateAltText = useGenerateAltText();

  const replaceVariants = useReplaceUploadVariants({
    category,
    locationId,
    onSuccess: () => {
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Photo imported. Variants saved.", center);
    },
    onError: (error) => {
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to save variants", center);
    },
  });

  const stagedSources = sourcesQuery.data?.sources ?? [];
  const pendingSources = stagedSources.filter(
    (s) => !s.hasVariants && (s.stagedSourceStatus !== "ready" || s.hasSource)
  );

  function closeCropper() {
    setCropState(CLOSED_CROP_STATE);
  }

  function handleConfirmPick(photos: PhotoImportStartPhoto[]) {
    if (photos.length === 0) {
      setPickerOpen(false);
      return;
    }
    startImport.mutate(
      { locationId, photos },
      {
        onSuccess: () => {
          setPickerOpen(false);
        },
        onError: (err) => {
          const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast(err instanceof Error ? err.message : "Failed to start import", center);
        },
      }
    );
  }

  async function fetchSourceFile(source: StagedSourceSnapshot): Promise<File> {
    if (!source.sourcePath) throw new Error("Missing source image");
    const url = `${toImageApiPath(source.sourcePath)}?v=${source.uploadId}-${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load source (${response.status})`);
    const blob = await response.blob();
    return new File(
      [blob],
      getFileNameFromPath(source.sourcePath, `${source.origin}-${source.uploadId}.webp`),
      { type: blob.type || "image/webp" }
    );
  }

  async function handleOpenReview(source: StagedSourceSnapshot) {
    if (!source.sourcePath) return;
    setLoadingSourceId(source.uploadId);
    try {
      const file = await fetchSourceFile(source);
      const cachedAltText = cachedAltTexts[source.uploadId] ?? source.altText ?? "";
      setAltReviewState({
        isOpen: true,
        uploadId: source.uploadId,
        file,
        generatedText: cachedAltText,
        error: null,
      });
      if (!cachedAltText) await generateAltTextForReview(file, source.uploadId);
    } catch (err) {
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(err instanceof Error ? err.message : "Failed to load source", center);
    } finally {
      setLoadingSourceId((current) => (current === source.uploadId ? null : current));
    }
  }

  async function generateAltTextForReview(file: File, uploadId: number) {
    try {
      const result = await generateAltText.mutateAsync({ imageFile: file, uploadId });
      setCachedAltTexts((current) => ({ ...current, [uploadId]: result.altText }));
      setAltReviewState((state) => state.uploadId === uploadId
        ? { ...state, generatedText: result.altText, error: null }
        : state);
    } catch (error) {
      setAltReviewState((state) => state.uploadId === uploadId
        ? { ...state, error: error instanceof Error ? error.message : "Alt-text generation failed" }
        : state);
    }
  }

  function closeAltReview() {
    setAltReviewState(CLOSED_ALT_REVIEW_STATE);
  }

  function confirmAltText(altText: string) {
    if (!altReviewState.uploadId || !altReviewState.file) return;
    setCropState({
      isOpen: true,
      uploadId: altReviewState.uploadId,
      file: altReviewState.file,
      altText,
    });
    closeAltReview();
  }

  function regenerateAltText() {
    if (altReviewState.file && altReviewState.uploadId) {
      void generateAltTextForReview(altReviewState.file, altReviewState.uploadId);
    }
  }

  function handleCropConfirm(sourceFile: File, variantFiles: ImageVariantUploadFile[]) {
    if (!cropState.uploadId) return;
    replaceVariants.mutate({
      uploadId: cropState.uploadId,
      sourceFile,
      variantFiles,
      altText: cropState.altText,
    });
    closeCropper();
  }

  function handleDelete(source: StagedSourceSnapshot) {
    setDeleteConfirmSource(source);
  }

  function cancelDelete() {
    setDeleteConfirmSource(null);
  }

  function confirmDelete() {
    if (!deleteConfirmSource) return;
    deleteStaged.mutate({ uploadId: deleteConfirmSource.uploadId, locationId });
    setDeleteConfirmSource(null);
  }

  function handleRetry(source: StagedSourceSnapshot) {
    retryStaged.mutate({ uploadId: source.uploadId, locationId });
  }

  return {
    photoImportEnabled,
    pickerOpen,
    cropState,
    altReviewState,
    loadingSourceId,
    startImport,
    retryPending: retryStaged.isPending,
    pendingSources,
    setPickerOpen,
    closeCropper,
    closeAltReview,
    handleConfirmPick,
    handleOpenReview,
    confirmAltText,
    regenerateAltText,
    isGeneratingAltText: generateAltText.isPending,
    handleCropConfirm,
    handleDelete,
    handleRetry,
    deleteConfirmSource,
    cancelDelete,
    confirmDelete,
    isDeleting: deleteStaged.isPending,
  };
}
