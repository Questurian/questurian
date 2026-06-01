import { useState } from "react";
import type { ImageVariant } from "@questurian/lm-shared";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import type { ImageMetadata, InstagramEmbed, LocationResponse, Upload } from "@client/shared/services/api/types";
import { useToast } from "@client/shared/hooks/useToast";
import { useDeleteUpload } from "@client/shared/services/api/hooks/useDeleteUpload";
import { useDeleteInstagramEmbed } from "@client/shared/services/api/hooks/useDeleteInstagramEmbed";
import { useReplaceUploadVariants } from "@client/shared/services/api/hooks/useReplaceUploadVariants";
import { useUpdateUploadPhotographerCredit } from "@client/shared/services/api/hooks/useUpdateUploadPhotographerCredit";
import {
  usePayloadMediaSetSelection,
} from "../payload-selection/usePayloadMediaSetSelection";
import {
  getFileNameFromPath,
  getMissingVariantCount,
  hasMissingPhotographerCredit,
  normalizeInstagramHandle,
  REQUIRED_VARIANT_COUNT,
  toImageApiPath,
} from "./location-media-gallery.utils";

type DeleteConfirm = { type: "upload" | "instagram"; id: number } | null;
export type EditCreditState = { uploadId: number; value: string; error: string | null } | null;
type ManualCropState = { isOpen: boolean; uploadId: number | null; file: File | null; altText?: string };
type LightboxState = {
  isOpen: boolean;
  images: string[];
  currentIndex: number;
  photographerCredit?: string;
  imageMetadata?: ImageMetadata[];
  instagramUrl?: string;
  embedCode?: string;
  editableUploadId?: number;
};

const CLOSED_CROP_STATE: ManualCropState = {
  isOpen: false,
  uploadId: null,
  file: null,
  altText: undefined,
};

const CLOSED_LIGHTBOX_STATE: LightboxState = {
  isOpen: false,
  images: [],
  currentIndex: 0,
};

export function useLocationMediaGallery(locationDetail: LocationResponse) {
  const { showToast } = useToast();
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>(null);
  const [editCreditState, setEditCreditState] = useState<EditCreditState>(null);
  const [loadingSourceUploadId, setLoadingSourceUploadId] = useState<number | null>(null);
  const [manualCropState, setManualCropState] = useState<ManualCropState>(CLOSED_CROP_STATE);
  const [lightboxState, setLightboxState] = useState<LightboxState>(CLOSED_LIGHTBOX_STATE);

  const uploadsWithPreview = (locationDetail.uploads || []).filter((upload) =>
    upload.imageSet?.variants?.some((variant) => Boolean(variant.path?.trim())) ?? false
  );
  const instagramEmbedsWithPreview = (locationDetail.instagram_embeds || []).filter((embed) =>
    Boolean(embed.images?.[0]?.trim())
  );
  const isAttraction = locationDetail.category === "attractions";
  const payloadSelection = usePayloadMediaSetSelection(locationDetail);
  const selectedMediaSets = isAttraction ? payloadSelection.selectedMediaSets : [];
  const totalGalleryCount = uploadsWithPreview.length + selectedMediaSets.length;
  const missingCreditCount = uploadsWithPreview.filter((upload) =>
    hasMissingPhotographerCredit(upload.imageSet?.photographerCredit)
  ).length;
  const incompleteVariantCount = uploadsWithPreview.filter((upload) =>
    getMissingVariantCount(upload) > 0
  ).length;
  const centerToast = (message: string) =>
    showToast(message, { x: window.innerWidth / 2, y: window.innerHeight / 2 });

  const deleteMutation = useDeleteUpload({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: () => centerToast("Upload deleted successfully"),
    onError: (error) => centerToast(error.message || "Failed to delete upload"),
  });
  const deleteInstagramMutation = useDeleteInstagramEmbed({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: () => centerToast("Instagram embed deleted successfully"),
    onError: (error) => centerToast(error.message || "Failed to delete Instagram embed"),
  });
  const updatePhotographerCreditMutation = useUpdateUploadPhotographerCredit({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: () => {
      centerToast("Photographer credit updated");
      setEditCreditState(null);
    },
    onError: (error) => centerToast(error.message || "Failed to update photographer credit"),
  });
  const replaceVariantsMutation = useReplaceUploadVariants({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: () =>
      centerToast(`Variants updated to ${REQUIRED_VARIANT_COUNT}. Run Payload Sync to refresh CMS media sets.`),
    onError: (error) => centerToast(error.message || "Failed to replace image variants"),
  });

  async function openManualCrop(upload: Upload) {
    const sourcePath = upload.imageSet?.sourceImage?.path;
    if (!upload.id || !sourcePath) {
      centerToast("Source image unavailable for manual crop");
      return;
    }
    setLoadingSourceUploadId(upload.id);
    try {
      const response = await fetch(`${toImageApiPath(sourcePath)}?v=${upload.id}-source-${Date.now()}`);
      if (!response.ok) throw new Error(`Failed to load source image (${response.status})`);
      const blob = await response.blob();
      setManualCropState({
        isOpen: true,
        uploadId: upload.id,
        file: new File([blob], getFileNameFromPath(sourcePath, `upload-${upload.id}-source.webp`), {
          type: blob.type || "image/webp",
        }),
        altText: upload.imageSet?.altText,
      });
    } catch (error) {
      centerToast(error instanceof Error ? error.message : "Failed to load source image");
    } finally {
      setLoadingSourceUploadId((current) => (current === upload.id ? null : current));
    }
  }

  function openUpload(upload: Upload) {
    const variants = upload.imageSet?.variants?.filter((variant: ImageVariant) => Boolean(variant.path?.trim()));
    if (!variants?.length) return;
    if (getMissingVariantCount(upload) > 0) {
      void openManualCrop(upload);
      return;
    }
    const squareIndex = variants.findIndex((variant) => variant.type === "square");
    setLightboxState({
      isOpen: true,
      images: variants.map((variant) => variant.path),
      currentIndex: squareIndex >= 0 ? squareIndex : 0,
      photographerCredit: upload.imageSet?.photographerCredit?.trim() || undefined,
      imageMetadata: variants.map((variant) => ({
        width: variant.dimensions.width,
        height: variant.dimensions.height,
        size: variant.size,
        format: variant.format,
      })),
      editableUploadId: upload.id,
    });
  }

  function openInstagram(embed: InstagramEmbed, currentIndex = 0) {
    setLightboxState({
      isOpen: true,
      images: embed.images || [],
      currentIndex,
      photographerCredit: normalizeInstagramHandle(embed.username),
      instagramUrl: embed.url,
      embedCode: embed.embed_code,
    });
  }

  function confirmDelete() {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "upload") deleteMutation.mutate(deleteConfirm.id);
    else deleteInstagramMutation.mutate(deleteConfirm.id);
    setDeleteConfirm(null);
  }

  function savePhotographerCredit() {
    if (!editCreditState) return;
    const photographerCredit = editCreditState.value.trim();
    if (!photographerCredit) {
      setEditCreditState({ ...editCreditState, error: "Photographer credit is required" });
      return;
    }
    updatePhotographerCreditMutation.mutate({ uploadId: editCreditState.uploadId, photographerCredit });
  }

  function editCreditFromLightbox() {
    if (!lightboxState.editableUploadId) return;
    setEditCreditState({
      uploadId: lightboxState.editableUploadId,
      value: lightboxState.photographerCredit || "",
      error: null,
    });
    setLightboxState((state) => ({ ...state, isOpen: false, editableUploadId: undefined }));
  }

  function confirmManualCrop(sourceFile: File, variantFiles: ImageVariantUploadFile[]) {
    if (!manualCropState.uploadId) return;
    replaceVariantsMutation.mutate({
      uploadId: manualCropState.uploadId,
      sourceFile,
      variantFiles,
      altText: manualCropState.altText,
    });
    setManualCropState(CLOSED_CROP_STATE);
  }

  return {
    uploadsWithPreview, instagramEmbedsWithPreview, isAttraction, payloadSelection, selectedMediaSets,
    totalGalleryCount, missingCreditCount, incompleteVariantCount, loadingSourceUploadId,
    deleteConfirm, setDeleteConfirm, editCreditState, setEditCreditState, manualCropState,
    closeManualCrop: () => setManualCropState(CLOSED_CROP_STATE), lightboxState,
    closeLightbox: () => setLightboxState((state) => ({ ...state, isOpen: false, editableUploadId: undefined })),
    nextLightboxImage: () => setLightboxState((state) => ({ ...state, currentIndex: Math.min(state.currentIndex + 1, state.images.length - 1) })),
    previousLightboxImage: () => setLightboxState((state) => ({ ...state, currentIndex: Math.max(state.currentIndex - 1, 0) })),
    openUpload, openInstagram, confirmDelete, savePhotographerCredit, editCreditFromLightbox,
    confirmManualCrop, updatePhotographerCreditMutation, showToast,
  };
}
