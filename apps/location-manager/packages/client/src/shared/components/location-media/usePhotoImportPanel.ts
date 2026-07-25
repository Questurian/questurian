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
import { useToast } from "@client/shared/hooks/useToast";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import type { LocationCategory, PhotoImportStartPhoto } from "@questurian/lm-shared";
import { useAltTextReview } from "./useAltTextReview";

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
  const [deleteConfirmSource, setDeleteConfirmSource] = useState<StagedSourceSnapshot | null>(null);
  const [previewSource, setPreviewSource] = useState<StagedSourceSnapshot | null>(null);

  const sourcesQuery = useStagedSources(locationId, { pollForIncoming: hasActiveInstagramStaging });
  const startImport = useStartPhotoImport();
  const retryStaged = useRetryStagedSource();
  const deleteStaged = useDeleteStagedSource();

  // Approving an alt text advances straight into the cropper for that source.
  const altReview = useAltTextReview({
    onApproved: (uploadId, file, altText) => {
      setCropState({ isOpen: true, uploadId, file, altText });
    },
  });

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

  // Opens a read-only, full-size view of the staged image. Deliberately does
  // NOT touch the alt-text AI — that only fires from handleOpenReview.
  function openPreview(source: StagedSourceSnapshot) {
    setPreviewSource(source);
  }

  function closePreview() {
    setPreviewSource(null);
  }

  // From the preview, jump into the real Review flow (which does trigger the AI).
  function reviewFromPreview() {
    if (!previewSource) return;
    const source = previewSource;
    setPreviewSource(null);
    void altReview.handleOpenReview(source);
  }

  // From the preview, hand off to the delete-confirmation flow.
  function deleteFromPreview() {
    if (!previewSource) return;
    const source = previewSource;
    setPreviewSource(null);
    setDeleteConfirmSource(source);
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
    altReviewState: altReview.altReviewState,
    loadingSourceId: altReview.loadingSourceId,
    startImport,
    retryPending: retryStaged.isPending,
    pendingSources,
    setPickerOpen,
    closeCropper,
    closeAltReview: altReview.closeAltReview,
    handleConfirmPick,
    handleOpenReview: altReview.handleOpenReview,
    previewSource,
    openPreview,
    closePreview,
    reviewFromPreview,
    deleteFromPreview,
    confirmAltText: altReview.confirmAltText,
    regenerateAltText: altReview.regenerateAltText,
    isGeneratingAltText: altReview.isGeneratingAltText,
    handleCropConfirm,
    handleDelete,
    handleRetry,
    deleteConfirmSource,
    cancelDelete,
    confirmDelete,
    isDeleting: deleteStaged.isPending,
  };
}
