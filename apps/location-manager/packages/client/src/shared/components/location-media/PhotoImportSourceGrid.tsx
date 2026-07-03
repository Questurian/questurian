import { AlertTriangle, Loader2, RotateCw, Scissors, Trash2, Wand2 } from "lucide-react";
import { Button } from "@client/components/ui";
import type { StagedSourceSnapshot } from "@client/shared/services/api";
import { toImageApiPath } from "./photoImportPanel.utils";

const STATUS_STYLES: Record<NonNullable<StagedSourceSnapshot["stagedSourceStatus"]>, string> = {
  downloading: "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/30",
  ready: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30",
};

type PhotoImportSourceGridProps = {
  sources: StagedSourceSnapshot[];
  photoImportEnabled: boolean;
  retryPending: boolean;
  loadingSourceId: number | null;
  autoCropSourceId: number | null;
  onDelete: (source: StagedSourceSnapshot) => void;
  onRetry: (source: StagedSourceSnapshot) => void;
  onOpenCrop: (source: StagedSourceSnapshot) => void;
  onAutoCrop: (source: StagedSourceSnapshot) => void;
};

export function PhotoImportSourceGrid({
  sources,
  photoImportEnabled,
  retryPending,
  loadingSourceId,
  autoCropSourceId,
  onDelete,
  onRetry,
  onOpenCrop,
  onAutoCrop,
}: PhotoImportSourceGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {sources.map((source) => {
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
              onClick={() => onDelete(source)}
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
                    onClick={() => onOpenCrop(source)}
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
                    onClick={() => onAutoCrop(source)}
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
                      onClick={() => onRetry(source)}
                      disabled={retryPending}
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
  );
}
