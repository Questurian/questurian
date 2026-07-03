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
import { createMultiVariantImages } from "@client/shared/lib/image-processing";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import type { LocationCategory, PhotoImportStartPhoto } from "@questurian/lm-shared";
import {
  buildCenterCropStates,
  getFileNameFromPath,
  loadImageDimensions,
  toImageApiPath,
} from "./photoImportPanel.utils";

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
};

export function usePhotoImportPanel({ locationId, category }: UsePhotoImportPanelOptions) {
  const { showToast } = useToast();
  const { enabled: photoImportEnabled } = useGooglePhotoImportEnabled();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cropState, setCropState] = useState<CropModalState>(CLOSED_CROP_STATE);
  const [loadingSourceId, setLoadingSourceId] = useState<number | null>(null);
  const [autoCropSourceId, setAutoCropSourceId] = useState<number | null>(null);

  const sourcesQuery = useStagedSources(locationId);
  const startImport = useStartPhotoImport();
  const retryStaged = useRetryStagedSource();
  const deleteStaged = useDeleteStagedSource();

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
      getFileNameFromPath(source.sourcePath, `google-${source.uploadId}.webp`),
      { type: blob.type || "image/webp" }
    );
  }

  async function handleOpenCrop(source: StagedSourceSnapshot) {
    if (!source.sourcePath) return;
    setLoadingSourceId(source.uploadId);
    try {
      const file = await fetchSourceFile(source);
      setCropState({
        isOpen: true,
        uploadId: source.uploadId,
        file,
        altText: source.altText ?? undefined,
      });
    } catch (err) {
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(err instanceof Error ? err.message : "Failed to load source", center);
    } finally {
      setLoadingSourceId((current) => (current === source.uploadId ? null : current));
    }
  }

  async function handleAutoCrop(source: StagedSourceSnapshot) {
    if (!source.sourcePath) return;
    setAutoCropSourceId(source.uploadId);
    let objectUrl: string | null = null;
    try {
      const file = await fetchSourceFile(source);
      const { url: imageUrl, width, height } = await loadImageDimensions(file);
      objectUrl = imageUrl;
      const cropStates = buildCenterCropStates(width, height);
      const variantFiles = await createMultiVariantImages(imageUrl, cropStates, file.name, 0);
      replaceVariants.mutate({
        uploadId: source.uploadId,
        sourceFile: file,
        variantFiles,
        altText: source.altText ?? undefined,
      });
    } catch (err) {
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(err instanceof Error ? err.message : "Auto-crop failed", center);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setAutoCropSourceId((current) => (current === source.uploadId ? null : current));
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
    if (!window.confirm("Delete and remember as rejected? This photo won't be re-offered on future imports.")) {
      return;
    }
    deleteStaged.mutate({ uploadId: source.uploadId, locationId });
  }

  function handleRetry(source: StagedSourceSnapshot) {
    retryStaged.mutate({ uploadId: source.uploadId, locationId });
  }

  return {
    photoImportEnabled,
    pickerOpen,
    cropState,
    loadingSourceId,
    autoCropSourceId,
    startImport,
    retryPending: retryStaged.isPending,
    pendingSources,
    setPickerOpen,
    closeCropper,
    handleConfirmPick,
    handleOpenCrop,
    handleAutoCrop,
    handleCropConfirm,
    handleDelete,
    handleRetry,
  };
}
