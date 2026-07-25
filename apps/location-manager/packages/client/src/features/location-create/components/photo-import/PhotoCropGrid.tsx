import { Check, ImageOff, Loader2, RefreshCcw, Wand2, X } from "lucide-react";
import { MultiVariantCropperModal } from "@client/shared/components/location-media/modals/MultiVariantCropperModal";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import type { SourceCard } from "./photo-import-phase.types";

interface PhotoCropGridProps {
  selected: Set<string>;
  cards: Map<string, SourceCard>;
  activeSourceName: string | null;
  activeSourceFile: File | null;
  onBack: () => void;
  onRemoveSource: (sourceName: string) => void;
  onOpenCropper: (sourceName: string) => Promise<void>;
  onAutoCropSource: (sourceName: string) => Promise<void>;
  onAutoCropAll: () => Promise<void>;
  onCropCancel: () => void;
  onCropConfirm: (
    sourceFile: File,
    variantFiles: ImageVariantUploadFile[],
    credit?: string
  ) => Promise<void>;
}

export function PhotoCropGrid({
  selected,
  cards,
  activeSourceName,
  activeSourceFile,
  onBack,
  onRemoveSource,
  onOpenCropper,
  onAutoCropSource,
  onAutoCropAll,
  onCropCancel,
  onCropConfirm,
}: PhotoCropGridProps) {
  const visibleCards = Array.from(selected)
    .map((name) => cards.get(name))
    .filter((card): card is SourceCard => Boolean(card));
  const croppedCount = visibleCards.filter((card) => card.uiStatus === "cropped").length;

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
            onClick={() => void onAutoCropAll()}
            disabled={visibleCards.every(
              (card) => card.uiStatus === "cropped" || card.uiStatus === "fetching"
            )}
            title="Center-crop all remaining photos at every variant ratio"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Wand2 className="h-3 w-3" />
            Auto-crop all
          </button>
          <button
            type="button"
            onClick={onBack}
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
                onClick={() => onRemoveSource(card.name)}
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
                <p className="truncate text-[11px] text-muted-foreground">{card.authorDisplayName}</p>
              )}
              {card.uiStatus === "failed" && card.errorMessage && (
                <p className="line-clamp-2 text-[11px] text-rose-600">{card.errorMessage}</p>
              )}
              <div className="mt-1 flex items-center gap-1">
                {card.uiStatus === "failed" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void onOpenCropper(card.name)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                    >
                      <RefreshCcw className="h-3 w-3" /> Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveSource(card.name)}
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
                      onClick={() => void onOpenCropper(card.name)}
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
                        onClick={() => void onAutoCropSource(card.name)}
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
          onClose={onCropCancel}
          onConfirm={(sourceFile, variantFiles, credit) =>
            void onCropConfirm(sourceFile, variantFiles, credit)
          }
          initialPhotographerCredit={
            cards.get(activeSourceName)?.cropped?.photographerCredit
            ?? cards.get(activeSourceName)?.authorDisplayName
            ?? "Google"
          }
        />
      )}
    </div>
  );
}
