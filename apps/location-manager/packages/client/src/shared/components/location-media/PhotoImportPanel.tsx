import { useState } from "react";
import { Camera, Loader2, AlertTriangle, Scissors, Trash2, RotateCw, Wand2 } from "lucide-react";
import { Button } from "@client/components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import {
  useStagedSources,
  useStartPhotoImport,
  useRetryStagedSource,
  useDeleteStagedSource,
  type StagedSourceSnapshot,
} from "@client/shared/services/api";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import type {
  LocationCategory,
  ImageVariantType,
  PhotoImportStartPhoto,
} from "@questurian/lm-shared";
import { VARIANT_SPECS } from "@questurian/lm-shared";
import { useToast } from "@client/shared/hooks/useToast";
import { useGooglePhotoImportEnabled } from "@client/shared/services/api/hooks";
import { useReplaceUploadVariants } from "@client/shared/services/api/hooks/useReplaceUploadVariants";
import { PickPhotosPhase } from "@client/features/location-create/components/PickPhotosPhase";
import { MultiVariantCropperModal } from "./modals/MultiVariantCropperModal";
import { createMultiVariantImages } from "@client/shared/lib/image-processing";
import type { CropState } from "@client/shared/types/location-media.types";

const VARIANT_TYPES: ImageVariantType[] = [
  "thumbnail",
  "square",
  "wide",
  "open_graph",
  "editorial",
  "portrait",
  "hero",
];

function buildCenterCropStates(
  imageWidth: number,
  imageHeight: number
): Record<ImageVariantType, CropState> {
  const states = {} as Record<ImageVariantType, CropState>;
  for (const type of VARIANT_TYPES) {
    const ratio = VARIANT_SPECS[type].ratio;
    const imageRatio = imageWidth / imageHeight;
    let cropW: number;
    let cropH: number;
    if (imageRatio > ratio) {
      cropH = imageHeight;
      cropW = cropH * ratio;
    } else {
      cropW = imageWidth;
      cropH = cropW / ratio;
    }
    const x = (imageWidth - cropW) / 2;
    const y = (imageHeight - cropH) / 2;
    states[type] = {
      variantType: type,
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(cropW),
        height: Math.round(cropH),
      },
      completed: true,
    };
  }
  return states;
}

function loadImageDimensions(file: File): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

interface PhotoImportPanelProps {
  locationId: number;
  category: LocationCategory;
  placeId: string | null | undefined;
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

function getFileNameFromPath(path: string, fallback: string): string {
  const fileName = path.split("/").pop();
  return fileName?.trim() ? fileName : fallback;
}

const STATUS_STYLES: Record<NonNullable<StagedSourceSnapshot["stagedSourceStatus"]>, string> = {
  downloading: "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/30",
  ready: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30",
};

export function PhotoImportPanel({ locationId, category, placeId }: PhotoImportPanelProps) {
  const { showToast } = useToast();
  const { enabled: photoImportEnabled } = useGooglePhotoImportEnabled();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cropState, setCropState] = useState<{
    isOpen: boolean;
    uploadId: number | null;
    file: File | null;
    altText?: string;
  }>({ isOpen: false, uploadId: null, file: null, altText: undefined });
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
  // Only show StagedSources that are still awaiting crop. Completed ones
  // (with variants) flow into the existing LocationMediaGallery grid. Rows
  // whose source was deleted under us (e.g. user removed the upload from the
  // gallery before this query refetched) are also hidden, since clicking Crop
  // on them would 404 on the now-gone source file.
  const pendingSources = stagedSources.filter(
    (s) => !s.hasVariants && (s.stagedSourceStatus !== "ready" || s.hasSource)
  );

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

  async function handleOpenCrop(source: StagedSourceSnapshot) {
    if (!source.sourcePath) return;
    setLoadingSourceId(source.uploadId);
    try {
      const url = `${toImageApiPath(source.sourcePath)}?v=${source.uploadId}-${Date.now()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load source (${response.status})`);
      const blob = await response.blob();
      const file = new File(
        [blob],
        getFileNameFromPath(source.sourcePath, `google-${source.uploadId}.webp`),
        { type: blob.type || "image/webp" }
      );
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
      const url = `${toImageApiPath(source.sourcePath)}?v=${source.uploadId}-${Date.now()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load source (${response.status})`);
      const blob = await response.blob();
      const file = new File(
        [blob],
        getFileNameFromPath(source.sourcePath, `google-${source.uploadId}.webp`),
        { type: blob.type || "image/webp" }
      );
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
    setCropState({ isOpen: false, uploadId: null, file: null, altText: undefined });
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

  // Hide the panel completely when pulling isn't possible (no placeId, or the
  // Google Photo Import toggle is off) and there are no pending sources. Pending
  // sources stay visible even when the toggle is off — their bytes are already
  // on disk, so cropping them costs nothing.
  if ((!placeId || !photoImportEnabled) && pendingSources.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Pull from Google</h3>
        </div>
        {placeId && photoImportEnabled && (
          <Button
            type="button"
            size="sm"
            onClick={() => setPickerOpen(true)}
            disabled={startImport.isPending}
          >
            {startImport.isPending ? "Importing…" : "Pull photos from Google"}
          </Button>
        )}
      </div>

      {!placeId && photoImportEnabled && (
        <p className="text-xs text-muted-foreground">
          Set a Google Place ID on this Location to enable photo import.
        </p>
      )}

      {pendingSources.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {pendingSources.map((source) => {
            const status = source.stagedSourceStatus ?? "downloading";
            return (
              <li
                key={source.uploadId}
                className="group relative flex aspect-square overflow-hidden rounded-md border border-border/60 bg-muted/40"
              >
                {source.hasSource && source.sourcePath ? (
                  <img
                    src={toImageApiPath(source.sourcePath)}
                    alt={source.altText ?? "Imported photo"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    {status === "downloading" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <AlertTriangle className="h-6 w-6 text-rose-500" />
                    )}
                  </div>
                )}

                <span
                  className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[status]}`}
                >
                  {status}
                </span>

                <button
                  type="button"
                  onClick={() => handleDelete(source)}
                  title="Delete and reject"
                  className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/80"
                >
                  <Trash2 className="h-3 w-3" />
                </button>

                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/70 to-transparent p-2">
                  {source.photographerCredit && (
                    <span className="truncate text-[10px] text-white">{source.photographerCredit}</span>
                  )}
                  {status === "ready" && (
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleOpenCrop(source)}
                        disabled={loadingSourceId === source.uploadId || autoCropSourceId === source.uploadId}
                        className="h-7 flex-1 gap-1.5 text-xs"
                      >
                        {loadingSourceId === source.uploadId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Scissors className="h-3 w-3" />
                        )}
                        Crop
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleAutoCrop(source)}
                        disabled={autoCropSourceId === source.uploadId || loadingSourceId === source.uploadId}
                        title="Auto-crop (center crop for all variants)"
                        className="h-7 flex-1 gap-1.5 text-xs"
                      >
                        {autoCropSourceId === source.uploadId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wand2 className="h-3 w-3" />
                        )}
                        Auto
                      </Button>
                    </div>
                  )}
                  {status === "failed" && (
                    <>
                      {source.errorMessage && (
                        <span className="truncate text-[10px] text-rose-200" title={source.errorMessage}>
                          {source.errorMessage}
                        </span>
                      )}
                      {photoImportEnabled && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => handleRetry(source)}
                          disabled={retryStaged.isPending}
                          className="h-7 gap-1.5 text-xs"
                        >
                          <RotateCw className="h-3 w-3" />
                          Retry
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={pickerOpen} onOpenChange={(open) => !open && setPickerOpen(false)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Pull photos from Google</DialogTitle>
          </DialogHeader>
          <PickPhotosPhase
            locationId={locationId}
            onConfirm={handleConfirmPick}
            onSkip={() => setPickerOpen(false)}
            continueLabel="Start import"
            busy={startImport.isPending}
          />
        </DialogContent>
      </Dialog>

      {cropState.isOpen && cropState.file && (
        <MultiVariantCropperModal
          file={cropState.file}
          isOpen={cropState.isOpen}
          onClose={() => setCropState({ isOpen: false, uploadId: null, file: null, altText: undefined })}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
