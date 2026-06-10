/**
 * Add-flow Photo Import phase (ADR-0007).
 *
 * Two internal sub-phases:
 *   1. "select" — Google photo grid; operator deselects unwanted shots.
 *   2. "crop"   — N selected sources rendered as cards with per-card status
 *                 (Fetching / Not cropped / Cropped / Failed). Operator clicks
 *                 each card to open MultiVariantCropperModal and produce all
 *                 7 variants + an editable photographer credit. Failed-fetch
 *                 cards offer Retry + Drop (Drop ≠ Reject; the photo's `name`
 *                 stays re-importable later via the edit surface).
 *
 * Reports the in-progress session to the parent on every change so the parent's
 * Create button can render correctly (gated on every selected source being
 * cropped). On wizard mount the IDB-persisted crops for the active session
 * are restored so a refresh mid-cropping doesn't vaporize the operator's work.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ImageOff, Loader2, RefreshCcw, Wand2, X } from "lucide-react";
import {
  usePhotoImportPreview,
  usePhotoImportPreviewByPlace,
} from "@client/shared/services/api";
import { photoImportApi } from "@client/shared/services/api/photo-import.api";
import { MultiVariantCropperModal } from "@client/shared/components/location-media/modals/MultiVariantCropperModal";
import type { CropState, ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import type { PhotoImportPhoto, PhotoImportStatus, ImageVariantType } from "@questurian/lm-shared";
import { VARIANT_SPECS } from "@questurian/lm-shared";
import { createMultiVariantImages } from "@client/shared/lib/image-processing";
import { addFlowPhotoSession, type PersistedSource } from "../lib/add-flow-photo-session";

const ALL_VARIANT_TYPES: ImageVariantType[] = [
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
  const imageRatio = imageWidth / imageHeight;
  for (const type of ALL_VARIANT_TYPES) {
    const ratio = VARIANT_SPECS[type].ratio;
    let cropW: number;
    let cropH: number;
    if (imageRatio > ratio) {
      cropH = imageHeight;
      cropW = cropH * ratio;
    } else {
      cropW = imageWidth;
      cropH = cropW / ratio;
    }
    states[type] = {
      variantType: type,
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: {
        x: Math.round((imageWidth - cropW) / 2),
        y: Math.round((imageHeight - cropH) / 2),
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

export interface CroppedPhotoSource {
  sourceName: string;
  sourceFile: File;
  variants: ImageVariantUploadFile[];
  photographerCredit: string;
}

export interface PhotoImportSessionState {
  sessionId: string;
  /** Sources the operator chose to import this session. */
  selected: string[];
  /** Sources that have all 7 variants cropped and ready to submit. */
  cropped: CroppedPhotoSource[];
  /** True when selected.length > 0 AND every selected source has been cropped. */
  ready: boolean;
}

interface PhotoImportPhaseProps {
  /** Required for the pre-Create flow — Location row does not exist yet. */
  placeId: string | null | undefined;
  /** Stable category tag for IDB session metadata. */
  category: string;
  /** Fires on every state change. Parent owns the Create button. */
  onSessionChange: (session: PhotoImportSessionState) => void;
  /** Called when operator explicitly wants to skip the photo import. */
  onSkip?: () => void;
}

type SourceUiStatus = "idle" | "fetching" | "cropped" | "failed";

interface SourceCard {
  name: string;
  previewUrl: string | null;
  authorDisplayName: string | null;
  uiStatus: SourceUiStatus;
  errorMessage: string | null;
  cropped: CroppedPhotoSource | null;
}

const STATUS_LABEL: Record<PhotoImportStatus, string> = {
  new: "New",
  staged: "Staged",
  imported: "Imported",
  rejected: "Rejected",
};

function isSelectable(photo: PhotoImportPhoto): boolean {
  return photo.status === "new" || photo.status === "rejected";
}

function defaultSelected(photos: PhotoImportPhoto[]): Set<string> {
  return new Set(photos.filter((p) => p.status === "new").map((p) => p.name));
}

function fileFromPersisted(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || "image/webp" });
}

function persistedToCropped(p: PersistedSource): CroppedPhotoSource | null {
  if (p.variants.length === 0) return null;
  const credit = p.credit ?? "";
  const variants: ImageVariantUploadFile[] = p.variants.map((v) => ({
    type: v.variantType,
    file: fileFromPersisted(v.blob, v.filename),
  }));
  // Synthesize a source File from the first variant blob is wrong — but we
  // don't persist the source separately today. The server treats `source_N`
  // as the canonical bytes; for restored sessions we re-fetch on demand via
  // the proxy. Persisted restore only re-hydrates variants; if the operator
  // re-opens the crop modal we'll re-proxy the source bytes. To keep Create
  // working without a fetch, we stash the *first variant file* as a stand-in
  // source — the server will re-write it through Sharp anyway when producing
  // the stored source artifact.
  // NOTE: improving this requires also persisting the source blob; tracked
  // as a follow-up.
  const sourceFile = variants[0].file;
  return {
    sourceName: p.sourceName,
    sourceFile,
    variants,
    photographerCredit: credit,
  };
}

export function PhotoImportPhase({
  placeId,
  category,
  onSessionChange,
  onSkip,
}: PhotoImportPhaseProps) {
  const byPlace = usePhotoImportPreviewByPlace(placeId ?? null, {
    enabled: !!placeId,
  });
  // Type alignment with PickPhotosPhase — usePhotoImportPreview not used here.
  void usePhotoImportPreview;

  const preview = byPlace.data?.preview;
  const photos = useMemo(() => preview?.photos ?? [], [preview]);

  const [subPhase, setSubPhase] = useState<"select" | "crop">("select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cards, setCards] = useState<Map<string, SourceCard>>(new Map());
  const [activeSourceName, setActiveSourceName] = useState<string | null>(null);
  const [activeSourceFile, setActiveSourceFile] = useState<File | null>(null);

  // One stable session id for the lifetime of this component mount.
  const sessionIdRef = useRef<string>(addFlowPhotoSession.newSessionId());
  const sessionId = sessionIdRef.current;

  // Restore previously-persisted variants once on mount, then GC stale sessions.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await addFlowPhotoSession.registerSession(sessionId, category);
        const persisted = await addFlowPhotoSession.loadSession(sessionId);
        if (cancelled || persisted.size === 0) return;
        setCards((prev) => {
          const next = new Map(prev);
          for (const [name, entry] of persisted.entries()) {
            const cropped = persistedToCropped(entry);
            if (!cropped) continue;
            next.set(name, {
              name,
              previewUrl: prev.get(name)?.previewUrl ?? null,
              authorDisplayName: prev.get(name)?.authorDisplayName ?? null,
              uiStatus: "cropped",
              errorMessage: null,
              cropped,
            });
          }
          return next;
        });
      } catch (err) {
        console.warn("[PhotoImportPhase] IDB restore failed", err);
      }
      void addFlowPhotoSession.pruneOlderThan().catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, category]);

  // Default-select all "new" photos when the preview loads.
  useEffect(() => {
    if (photos.length === 0) return;
    setSelected((prev) => (prev.size === 0 ? defaultSelected(photos) : prev));
  }, [photos]);

  // Notify parent of every session change.
  useEffect(() => {
    const cropped: CroppedPhotoSource[] = [];
    for (const name of selected) {
      const card = cards.get(name);
      if (card?.cropped) cropped.push(card.cropped);
    }
    const ready = selected.size > 0 && cropped.length === selected.size;
    onSessionChange({
      sessionId,
      selected: Array.from(selected),
      cropped,
      ready,
    });
  }, [selected, cards, sessionId, onSessionChange]);

  const togglePhoto = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const goToCrop = useCallback(() => {
    setCards((prev) => {
      const next = new Map(prev);
      for (const photo of photos) {
        if (!selected.has(photo.name)) continue;
        if (next.has(photo.name)) continue;
        next.set(photo.name, {
          name: photo.name,
          previewUrl: photo.previewUrl ?? null,
          authorDisplayName: photo.authorAttributions[0]?.displayName ?? null,
          uiStatus: "idle",
          errorMessage: null,
          cropped: null,
        });
      }
      return next;
    });
    setSubPhase("crop");
  }, [photos, selected]);

  const fetchSourceBytes = useCallback(
    async (sourceName: string): Promise<File | null> => {
      setCards((prev) => {
        const card = prev.get(sourceName);
        if (!card) return prev;
        return new Map(prev).set(sourceName, {
          ...card,
          uiStatus: "fetching",
          errorMessage: null,
        });
      });
      try {
        const blob = await photoImportApi.proxyPhotoBytes(sourceName, 1600);
        return new File([blob], `${sourceName.replace(/\//g, "_")}.jpg`, {
          type: blob.type || "image/jpeg",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to fetch photo";
        setCards((prev) => {
          const card = prev.get(sourceName);
          if (!card) return prev;
          return new Map(prev).set(sourceName, {
            ...card,
            uiStatus: "failed",
            errorMessage: msg,
          });
        });
        return null;
      }
    },
    []
  );

  const openCropper = async (sourceName: string) => {
    const file = await fetchSourceBytes(sourceName);
    if (!file) return;
    setActiveSourceName(sourceName);
    setActiveSourceFile(file);
  };

  const removeSource = (sourceName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(sourceName);
      return next;
    });
    setCards((prev) => {
      const next = new Map(prev);
      next.delete(sourceName);
      return next;
    });
    void addFlowPhotoSession.removeSource(sessionId, sourceName).catch(() => undefined);
  };

  const dropFailedSource = (sourceName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(sourceName);
      return next;
    });
    setCards((prev) => {
      const next = new Map(prev);
      next.delete(sourceName);
      return next;
    });
    void addFlowPhotoSession.removeSource(sessionId, sourceName).catch(() => undefined);
  };

  const handleCropConfirm = async (
    sourceFile: File,
    variantFiles: ImageVariantUploadFile[],
    credit?: string
  ) => {
    const sourceName = activeSourceName;
    if (!sourceName) return;
    const photographerCredit = (credit && credit.trim()) || "Google";
    const cropped: CroppedPhotoSource = {
      sourceName,
      sourceFile,
      variants: variantFiles,
      photographerCredit,
    };
    setCards((prev) => {
      const card = prev.get(sourceName);
      if (!card) return prev;
      return new Map(prev).set(sourceName, {
        ...card,
        uiStatus: "cropped",
        errorMessage: null,
        cropped,
      });
    });
    setActiveSourceName(null);
    setActiveSourceFile(null);
    try {
      await addFlowPhotoSession.putSourceVariants(
        sessionId,
        sourceName,
        variantFiles.map((v) => ({ variantType: v.type as ImageVariantType, file: v.file })),
        photographerCredit
      );
    } catch (err) {
      console.warn("[PhotoImportPhase] IDB persist failed", err);
    }
  };

  const autoCropSource = useCallback(
    async (sourceName: string) => {
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
        setCards((prev) => {
          const existing = prev.get(sourceName);
          if (!existing) return prev;
          return new Map(prev).set(sourceName, {
            ...existing,
            uiStatus: "cropped",
            errorMessage: null,
            cropped,
          });
        });
        try {
          await addFlowPhotoSession.putSourceVariants(
            sessionId,
            sourceName,
            variantFiles.map((v) => ({ variantType: v.type as ImageVariantType, file: v.file })),
            photographerCredit
          );
        } catch (err) {
          console.warn("[PhotoImportPhase] IDB persist failed", err);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Auto-crop failed";
        setCards((prev) => {
          const existing = prev.get(sourceName);
          if (!existing) return prev;
          return new Map(prev).set(sourceName, {
            ...existing,
            uiStatus: "failed",
            errorMessage: msg,
          });
        });
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    },
    [cards, fetchSourceBytes, sessionId]
  );

  const autoCropAll = useCallback(async () => {
    const targets = Array.from(selected).filter((name) => {
      const c = cards.get(name);
      return c && c.uiStatus !== "cropped" && c.uiStatus !== "fetching";
    });
    for (const name of targets) {
      await autoCropSource(name);
    }
  }, [autoCropSource, cards, selected]);

  const handleCropCancel = () => {
    setActiveSourceName(null);
    setActiveSourceFile(null);
  };

  // ---- render ----

  if (byPlace.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading Google photos…</p>
      </div>
    );
  }

  if (byPlace.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-destructive">
          {byPlace.error instanceof Error ? byPlace.error.message : "Failed to load Google photos"}
        </p>
        {onSkip && (
          <button type="button" onClick={onSkip} className="text-sm text-muted-foreground underline">
            Skip and continue
          </button>
        )}
      </div>
    );
  }

  if (!preview?.configured) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Camera className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Google Photo Import is disabled on the server.
        </p>
        {onSkip && (
          <button type="button" onClick={onSkip} className="text-sm text-foreground underline">
            Continue without photos
          </button>
        )}
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Google returned no photos for this place.</p>
        {onSkip && (
          <button type="button" onClick={onSkip} className="text-sm text-foreground underline">
            Continue without photos
          </button>
        )}
      </div>
    );
  }

  if (subPhase === "select") {
    const selectableCount = photos.filter(isSelectable).length;
    const allSelected = selectableCount > 0 && selected.size === selectableCount;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Pull photos from Google</h3>
            <p className="text-sm text-muted-foreground">
              {photos.length} photo{photos.length === 1 ? "" : "s"} returned. Selected photos will need to be cropped before this Location can be created.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (allSelected) setSelected(new Set());
              else setSelected(new Set(photos.filter(isSelectable).map((p) => p.name)));
            }}
            className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {photos.map((photo) => {
            const selectable = isSelectable(photo);
            const checked = selected.has(photo.name);
            const credit = photo.authorAttributions[0]?.displayName;
            return (
              <label
                key={photo.name}
                className={`group flex cursor-pointer flex-col overflow-hidden rounded-md border-2 transition ${
                  checked ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-border"
                } ${!selectable ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <div className="relative aspect-square w-full">
                  {photo.previewUrl ? (
                    <img
                      src={photo.previewUrl}
                      alt={credit || "Google place photo"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}
                  <input
                    type="checkbox"
                    className="absolute left-2 top-2 h-4 w-4 accent-primary"
                    checked={checked}
                    disabled={!selectable}
                    onChange={() => selectable && togglePhoto(photo.name)}
                  />
                  <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase text-white">
                    {STATUS_LABEL[photo.status]}
                  </span>
                </div>
                <div className="border-t border-border/60 bg-muted/30 px-2 py-1.5">
                  <p className="truncate text-[11px] font-medium text-foreground" title={credit || ""}>
                    {credit || <span className="italic text-muted-foreground">No credit</span>}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-sm text-muted-foreground">{selected.size} selected</div>
          <div className="flex items-center gap-2">
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={goToCrop}
              disabled={selected.size === 0}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Continue to crop ({selected.size})
            </button>
          </div>
        </div>
      </div>
    );
  }

  // subPhase === "crop"
  const visibleCards = Array.from(selected).map((name) => cards.get(name)).filter(Boolean) as SourceCard[];
  const croppedCount = visibleCards.filter((c) => c.uiStatus === "cropped").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Crop each photo</h3>
          <p className="text-sm text-muted-foreground">
            {croppedCount} of {visibleCards.length} cropped. All seven variants per photo are required before Create.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void autoCropAll()}
            disabled={visibleCards.every((c) => c.uiStatus === "cropped" || c.uiStatus === "fetching")}
            title="Center-crop all remaining photos at every variant ratio"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Wand2 className="h-3 w-3" />
            Auto-crop all
          </button>
          <button
            type="button"
            onClick={() => setSubPhase("select")}
            className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
          >
            Back to selection
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {visibleCards.map((card) => (
          <div
            key={card.name}
            className="relative flex flex-col overflow-hidden rounded-md border border-border bg-background"
          >
            <div className="relative aspect-square bg-muted">
              {card.previewUrl ? (
                <img src={card.previewUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff className="h-6 w-6" />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeSource(card.name)}
                title="Remove from import"
                className="absolute left-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-80 transition hover:bg-black/80 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {card.uiStatus === "fetching" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {card.uiStatus === "cropped" && (
                <span className="absolute right-1 top-1 inline-flex items-center gap-1 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  <Check className="h-3 w-3" /> Cropped
                </span>
              )}
              {card.uiStatus === "failed" && (
                <span className="absolute right-1 top-1 rounded bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Failed
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1 p-2">
              {card.authorDisplayName && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {card.authorDisplayName}
                </p>
              )}
              {card.uiStatus === "failed" && card.errorMessage && (
                <p className="line-clamp-2 text-[11px] text-rose-600">{card.errorMessage}</p>
              )}
              <div className="mt-1 flex items-center gap-1">
                {card.uiStatus === "failed" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void openCropper(card.name)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                    >
                      <RefreshCcw className="h-3 w-3" /> Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => dropFailedSource(card.name)}
                      title="Drop this photo from the import — stays re-importable later"
                      className="inline-flex items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void openCropper(card.name)}
                      disabled={card.uiStatus === "fetching"}
                      className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {card.uiStatus === "cropped"
                        ? "Re-crop"
                        : card.uiStatus === "fetching"
                        ? "Loading…"
                        : "Crop"}
                    </button>
                    {card.uiStatus !== "cropped" && (
                      <button
                        type="button"
                        onClick={() => void autoCropSource(card.name)}
                        disabled={card.uiStatus === "fetching"}
                        title="Auto-crop (center crop for all variants)"
                        className="inline-flex items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        <Wand2 className="h-3 w-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {activeSourceName && activeSourceFile && (
        <MultiVariantCropperModal
          file={activeSourceFile}
          isOpen={true}
          onClose={handleCropCancel}
          onConfirm={(sourceFile, variantFiles, credit) =>
            void handleCropConfirm(sourceFile, variantFiles, credit)
          }
          initialPhotographerCredit={
            cards.get(activeSourceName)?.cropped?.photographerCredit ??
            cards.get(activeSourceName)?.authorDisplayName ??
            "Google"
          }
        />
      )}
    </div>
  );
}
