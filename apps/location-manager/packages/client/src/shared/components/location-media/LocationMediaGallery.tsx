import { useState } from "react";
import type { LocationResponse, Upload, ImageMetadata, InstagramEmbed } from "@client/shared/services/api/types";
import { VARIANT_SPECS, type ImageVariant } from "@questurian/lm-shared";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import { Button } from "@client/components/ui";
import { Input } from "@client/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@client/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { X } from "lucide-react";
import { useToast } from "@client/shared/hooks/useToast";
import { useDeleteUpload } from "@client/shared/services/api/hooks/useDeleteUpload";
import { useDeleteInstagramEmbed } from "@client/shared/services/api/hooks/useDeleteInstagramEmbed";
import { useReplaceUploadVariants } from "@client/shared/services/api/hooks/useReplaceUploadVariants";
import { useUpdateUploadPhotographerCredit } from "@client/shared/services/api/hooks/useUpdateUploadPhotographerCredit";
import { AddInstagramEmbedForm } from "./forms/AddInstagramEmbedForm";
import { AddUploadFilesForm } from "./forms/AddUploadFilesForm";
import { PhotoImportPanel } from "./PhotoImportPanel";
import { MultiVariantCropperModal } from "./modals/MultiVariantCropperModal";
import { PayloadMediaSetSelector } from "./PayloadMediaSetSelector";
import {
  MAX_ATTRACTION_GALLERY_ITEMS,
  usePayloadMediaSetSelection,
} from "./usePayloadMediaSetSelection";
import { ImageLightbox } from "./ui/ImageLightbox";

interface LocationMediaGalleryProps {
  locationDetail: LocationResponse;
}

function toImageApiPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const stripped = normalized
    .replace(/^\/+/, "")
    .replace(/^data\/images\//, "")
    .replace(/^packages\/server\/data\/images\//, "")
    .replace(/^apps\/location-manager\/packages\/server\/data\/images\//, "");
  return `/api/images/${stripped}`;
}

function hasMissingPhotographerCredit(credit: string | null | undefined): boolean {
  return typeof credit !== "string" || credit.trim().length === 0;
}

function normalizeInstagramHandle(username: string | undefined): string | undefined {
  if (!username) {
    return undefined;
  }

  const normalized = username.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.startsWith("@") ? normalized : `@${normalized}`;
}

const REQUIRED_VARIANT_COUNT = Object.keys(VARIANT_SPECS).length;

function getMissingVariantCount(upload: Upload): number {
  const variantCount = upload.imageSet?.variants?.length ?? 0;
  return Math.max(0, REQUIRED_VARIANT_COUNT - variantCount);
}

function getFileNameFromPath(path: string, fallback: string): string {
  const fileName = path.split("/").pop();
  if (!fileName || !fileName.trim()) {
    return fallback;
  }
  return fileName;
}

export function LocationMediaGallery({ locationDetail }: LocationMediaGalleryProps) {
  const { showToast } = useToast();
  const uploadsWithPreview = (locationDetail.uploads || []).filter((upload) => {
    return upload.imageSet?.variants?.some((variant) => Boolean(variant.path?.trim())) ?? false;
  });
  const instagramEmbedsWithPreview = (locationDetail.instagram_embeds || []).filter((embed) =>
    Boolean(embed.images?.[0]?.trim())
  );

  const [deleteConfirm, setDeleteConfirm] = useState<
    | { type: "upload"; id: number }
    | { type: "instagram"; id: number }
    | null
  >(null);
  const [editCreditState, setEditCreditState] = useState<{
    uploadId: number;
    value: string;
    error: string | null;
  } | null>(null);
  const [loadingSourceUploadId, setLoadingSourceUploadId] = useState<number | null>(null);
  const [manualCropState, setManualCropState] = useState<{
    isOpen: boolean;
    uploadId: number | null;
    file: File | null;
    altText?: string;
  }>({
    isOpen: false,
    uploadId: null,
    file: null,
    altText: undefined,
  });

  const [lightboxState, setLightboxState] = useState({
    isOpen: false,
    images: [] as string[],
    currentIndex: 0,
    photographerCredit: undefined as string | undefined,
    imageMetadata: undefined as ImageMetadata[] | undefined,
    instagramUrl: undefined as string | undefined,
    embedCode: undefined as string | undefined,
    editableUploadId: undefined as number | undefined,
  });

  const deleteMutation = useDeleteUpload({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Upload deleted successfully", centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to delete upload", centerPosition);
    },
  });

  const deleteInstagramMutation = useDeleteInstagramEmbed({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Instagram embed deleted successfully", centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to delete Instagram embed", centerPosition);
    },
  });

  const updatePhotographerCreditMutation = useUpdateUploadPhotographerCredit({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Photographer credit updated", centerPosition);
      setEditCreditState(null);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to update photographer credit", centerPosition);
    },
  });

  const replaceVariantsMutation = useReplaceUploadVariants({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(
        `Variants updated to ${REQUIRED_VARIANT_COUNT}. Run Payload Sync to refresh CMS media sets.`,
        centerPosition
      );
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to replace image variants", centerPosition);
    },
  });

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

  function handleImageSetClick(upload: Upload) {
    if ('imageSet' in upload && upload.imageSet) {
      const imageSet = upload.imageSet;
      if (imageSet && imageSet.variants) {
        const missingVariantCount = getMissingVariantCount(upload);
        if (missingVariantCount > 0) {
          void handleOpenManualCrop(upload);
          return;
        }

        const variantsWithPath = imageSet.variants.filter((v: ImageVariant) =>
          Boolean(v.path?.trim())
        );
        if (variantsWithPath.length === 0) {
          return;
        }

        const variantPaths = variantsWithPath.map((v: ImageVariant) => v.path);
        const squareVariantIndex = variantsWithPath.findIndex(v => v.type === 'square');
        const startIndex = squareVariantIndex >= 0 ? squareVariantIndex : 0;
        const normalizedPhotographerCredit = imageSet.photographerCredit?.trim() || undefined;

        setLightboxState({
          isOpen: true,
          images: variantPaths,
          currentIndex: startIndex,
          photographerCredit: normalizedPhotographerCredit,
          imageMetadata: variantsWithPath.map(variant => ({
            width: variant.dimensions.width,
            height: variant.dimensions.height,
            size: variant.size,
            format: variant.format,
          })),
          instagramUrl: undefined,
          embedCode: undefined,
          editableUploadId: upload.id,
        });
      }
    }
  }

  async function handleOpenManualCrop(upload: Upload) {
    const sourcePath = upload.imageSet?.sourceImage?.path;
    const uploadId = upload.id;

    if (!uploadId || !sourcePath) {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Source image unavailable for manual crop", centerPosition);
      return;
    }

    setLoadingSourceUploadId(uploadId);

    try {
      const sourceUrl = `${toImageApiPath(sourcePath)}?v=${uploadId}-source-${Date.now()}`;
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Failed to load source image (${response.status})`);
      }

      const sourceBlob = await response.blob();
      const sourceFile = new File(
        [sourceBlob],
        getFileNameFromPath(sourcePath, `upload-${uploadId}-source.webp`),
        { type: sourceBlob.type || "image/webp" }
      );

      setManualCropState({
        isOpen: true,
        uploadId,
        file: sourceFile,
        altText: upload.imageSet?.altText,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load source image";
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(message, centerPosition);
    } finally {
      setLoadingSourceUploadId((current) => (current === uploadId ? null : current));
    }
  }

  function handleManualCropConfirm(
    sourceFile: File,
    variantFiles: ImageVariantUploadFile[]
  ) {
    if (!manualCropState.uploadId) {
      return;
    }

    replaceVariantsMutation.mutate({
      uploadId: manualCropState.uploadId,
      sourceFile,
      variantFiles,
      altText: manualCropState.altText,
    });

    setManualCropState({
      isOpen: false,
      uploadId: null,
      file: null,
      altText: undefined,
    });
  }

  function handleInstagramImageClick(embed: InstagramEmbed, imageIndex: number) {
    setLightboxState({
      isOpen: true,
      images: embed.images || [],
      currentIndex: imageIndex,
      photographerCredit: normalizeInstagramHandle(embed.username),
      imageMetadata: undefined,
      instagramUrl: embed.url,
      embedCode: embed.embed_code,
      editableUploadId: undefined,
    });
  }

  function handleLightboxNext() {
    setLightboxState((prev) => ({
      ...prev,
      currentIndex: Math.min(prev.currentIndex + 1, prev.images.length - 1),
    }));
  }

  function handleLightboxPrevious() {
    setLightboxState((prev) => ({
      ...prev,
      currentIndex: Math.max(prev.currentIndex - 1, 0),
    }));
  }

  function handleDeleteUpload(uploadId: number) {
    setDeleteConfirm({ type: "upload", id: uploadId });
  }

  function handleDeleteInstagramEmbed(embedId: number) {
    setDeleteConfirm({ type: "instagram", id: embedId });
  }

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "upload") {
      deleteMutation.mutate(deleteConfirm.id);
    } else {
      deleteInstagramMutation.mutate(deleteConfirm.id);
    }
    setDeleteConfirm(null);
  }

  function handleSavePhotographerCredit() {
    if (!editCreditState) {
      return;
    }

    const normalizedValue = editCreditState.value.trim();
    if (!normalizedValue) {
      setEditCreditState((prev) =>
        prev
          ? {
              ...prev,
              error: "Photographer credit is required",
            }
          : prev
      );
      return;
    }

    updatePhotographerCreditMutation.mutate({
      uploadId: editCreditState.uploadId,
      photographerCredit: normalizedValue,
    });
  }

  function handleEditCreditFromLightbox() {
    if (!lightboxState.editableUploadId) {
      return;
    }

    setLightboxState((prev) => ({
      ...prev,
      isOpen: false,
      editableUploadId: undefined,
    }));

    setEditCreditState({
      uploadId: lightboxState.editableUploadId,
      value: lightboxState.photographerCredit || "",
      error: null,
    });
  }

  return (
    <>
      {/* Unified Gallery: uploads + selected Payload CMS media sets */}
      {(uploadsWithPreview.length > 0 || isAttraction) && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAttraction
                ? `Gallery (${totalGalleryCount}/${MAX_ATTRACTION_GALLERY_ITEMS}):`
                : "Uploaded Images:"}
            </span>
            {isAttraction && (
              <span className="text-xs text-muted-foreground">
                {uploadsWithPreview.length} uploaded
                {selectedMediaSets.length > 0 && ` + ${selectedMediaSets.length} from CMS`}
              </span>
            )}
            {isAttraction && (
              <div className="ml-auto">
                <PayloadMediaSetSelector selection={payloadSelection} />
              </div>
            )}
          </div>
          {payloadSelection.saveError && (
            <p className="ml-4 text-xs text-amber-600">{payloadSelection.saveError}</p>
          )}
          {missingCreditCount > 0 && (
            <p className="ml-4 text-xs font-medium text-amber-600">
              {missingCreditCount} image set{missingCreditCount === 1 ? "" : "s"} missing photographer credit
            </p>
          )}
          {incompleteVariantCount > 0 && (
            <p className="ml-4 text-xs font-medium text-amber-600">
              {incompleteVariantCount} image set{incompleteVariantCount === 1 ? "" : "s"} with fewer than {REQUIRED_VARIANT_COUNT} variants
            </p>
          )}
          {totalGalleryCount === 0 && isAttraction && (
            <p className="ml-4 text-xs text-muted-foreground">
              No images yet. Upload below or pick existing photos from Payload CMS.
            </p>
          )}
          <ul className="flex gap-2 ml-4 flex-wrap">
            {uploadsWithPreview.map((upload) => {
              if (upload.imageSet) {
                const imageSet = upload.imageSet;
                const previewVariant = imageSet.variants?.find(v => v.type === 'square') || imageSet.variants?.[0];
                if (!previewVariant?.path) return null;
                const hasMissingCredit = hasMissingPhotographerCredit(imageSet.photographerCredit);
                const missingVariantCount = getMissingVariantCount(upload);
                const hasMissingVariants = missingVariantCount > 0;
                const isLoadingSource = loadingSourceUploadId === upload.id;

                const imageUrl = `${toImageApiPath(previewVariant.path)}?v=${upload.id ?? "upload"}`;
                return (
                  <li key={`${upload.id}-imageset`} className="relative group">
                    <div className={`shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-muted transition-all ${
                      hasMissingCredit || hasMissingVariants
                        ? "ring-2 ring-amber-500/70"
                        : "hover:ring-2 ring-primary"
                    }`}>
                      <img
                        src={imageUrl}
                        alt={imageSet.altText || imageSet.photographerCredit || "Uploaded image"}
                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        loading="lazy"
                        onClick={() => handleImageSetClick(upload)}
                        title={
                          hasMissingVariants
                            ? "Missing variants. Click to open manual crop UI."
                            : (imageSet.photographerCredit || "Click to view all variants")
                        }
                      />
                      </div>
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                        {imageSet.variants?.length || 0} variants
                      </div>
                      {hasMissingVariants && (
                        <div className="absolute top-1 left-1 bg-amber-700/90 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                          {missingVariantCount} missing
                        </div>
                      )}
                      {isLoadingSource && (
                        <div className="absolute top-6 left-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                          Loading source...
                        </div>
                      )}
                      {hasMissingCredit && (
                        <div
                          className={`absolute left-1 bg-amber-600/90 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none ${
                            hasMissingVariants || isLoadingSource ? "top-10" : "top-1"
                          }`}
                        >
                          Missing Credit
                        </div>
                      )}
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteUpload(upload.id!)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  );
              }

              return null;
            })}
            {selectedMediaSets.map((item, index) => {
              const orderIndex = uploadsWithPreview.length + index;
              return (
                <li key={`payload-${item.id}`} className="relative group">
                  <div className="shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-muted hover:ring-2 ring-primary transition-all">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.altText || item.title || "Payload CMS photo"}
                        className="w-full h-full object-cover hover:opacity-80 transition-opacity"
                        loading="lazy"
                        title={item.title || "Payload CMS photo"}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                        No preview
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                    CMS
                  </div>
                  <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                    #{orderIndex + 1}
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => payloadSelection.handleToggle(item)}
                    disabled={payloadSelection.isPending}
                    title="Remove from Payload selection"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Existing Instagram Embeds */}
      {instagramEmbedsWithPreview.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Instagram Posts:
          </span>
          <ul className="flex gap-2 ml-4 flex-wrap">
            {instagramEmbedsWithPreview.map((embed) => {
              const firstImage = embed.images?.[0];
              const imageUrl = firstImage
                ? `${toImageApiPath(firstImage)}?v=${embed.id ?? "embed"}`
                : null;

              return (
                <li key={embed.id} className="relative group">
                  {imageUrl && (
                    <div className="shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-muted hover:ring-2 ring-primary transition-all">
                      <img
                        src={imageUrl}
                        alt="Instagram"
                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        loading="lazy"
                        onClick={() => handleInstagramImageClick(embed, 0)}
                        title={embed.username ? `@${embed.username}` : "Click to view"}
                      />
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDeleteInstagramEmbed(embed.id!)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Photo Import flow — see ADR-0006 / CONTEXT.md "Photo Import flow" */}
      <PhotoImportPanel
        locationId={locationDetail.id}
        category={locationDetail.category}
        placeId={locationDetail.placeId ?? null}
      />

      {/* Instagram and Upload Forms */}
      <div className="flex gap-4">
        <div className="flex-1">
          <AddInstagramEmbedForm
            category={locationDetail.category}
            locationId={locationDetail.id}
            locationLabel={locationDetail.title || locationDetail.source?.name || ""}
          />
        </div>
        <div className="flex-1">
          <AddUploadFilesForm category={locationDetail.category} locationId={locationDetail.id} />
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.type === "instagram" ? "Instagram embed" : "upload"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The {deleteConfirm?.type === "instagram" ? "Instagram embed" : "uploaded image set"} will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={editCreditState !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditCreditState(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Photographer Credit</DialogTitle>
            <DialogDescription>
              Photographer credit is required for all uploaded image sets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={editCreditState?.value || ""}
              onChange={(event) =>
                setEditCreditState((prev) =>
                  prev
                    ? {
                        ...prev,
                        value: event.target.value,
                        error: null,
                      }
                    : prev
                )
              }
              placeholder="Name, studio, or publication"
              autoFocus
            />
            {editCreditState?.error && (
              <p className="text-xs text-destructive">{editCreditState.error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditCreditState(null)}
              disabled={updatePhotographerCreditMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSavePhotographerCredit}
              disabled={updatePhotographerCreditMutation.isPending}
            >
              {updatePhotographerCreditMutation.isPending ? "Saving..." : "Save Credit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {manualCropState.isOpen && manualCropState.file && (
        <MultiVariantCropperModal
          file={manualCropState.file}
          isOpen={manualCropState.isOpen}
          onClose={() =>
            setManualCropState({
              isOpen: false,
              uploadId: null,
              file: null,
              altText: undefined,
            })
          }
          onConfirm={handleManualCropConfirm}
        />
      )}

      {/* Image Lightbox */}
      {lightboxState.isOpen && (
        <ImageLightbox
          images={lightboxState.images}
          currentIndex={lightboxState.currentIndex}
          isOpen={lightboxState.isOpen}
          onClose={() => setLightboxState({
            ...lightboxState,
            isOpen: false,
            editableUploadId: undefined,
          })}
          onNext={handleLightboxNext}
          onPrevious={handleLightboxPrevious}
          photographerCredit={lightboxState.photographerCredit}
          imageMetadata={lightboxState.imageMetadata}
          instagramUrl={lightboxState.instagramUrl}
          embedCode={lightboxState.embedCode}
          showEditPhotographerCredit={!!lightboxState.editableUploadId}
          onEditPhotographerCredit={handleEditCreditFromLightbox}
          onCopySuccess={(message, position) => {
            showToast(message, position || { x: window.innerWidth / 2, y: window.innerHeight / 2 });
          }}
        />
      )}
    </>
  );
}
