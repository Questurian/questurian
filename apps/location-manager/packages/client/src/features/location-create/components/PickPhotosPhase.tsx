import { useEffect, useMemo, useState } from "react";
import { Camera, ImageOff, Loader2 } from "lucide-react";
import {
  usePhotoImportPreview,
  usePhotoImportPreviewByPlace,
} from "@client/shared/services/api";
import type {
  PhotoImportPhoto,
  PhotoImportStartPhoto,
  PhotoImportStatus,
} from "@questurian/lm-shared";

interface PickPhotosPhaseProps {
  /** Pre-Create path: Location doesn't exist yet. Status is always 'new'. */
  placeId?: string | null;
  /** Post-Create / edit path: full status annotations from server. */
  locationId?: number | null;
  /**
   * Fires on every selection toggle. Use for inline parent-owned selection
   * (e.g. add-form phases where the parent's Create button consumes the names).
   */
  onSelectionChange?: (selectedPhotoNames: string[]) => void;
  /**
   * Fires when the operator clicks the inner Continue button. Use for modal flows
   * where selection needs a discrete commit step. Hides the inner button when omitted.
   */
  onConfirm?: (selectedPhotos: PhotoImportStartPhoto[]) => void;
  /** Called when operator skips this phase. */
  onSkip?: () => void;
  /** Label shown above the grid. Defaults to "Pull photos from Google". */
  title?: string;
  /** Override Continue button label. */
  continueLabel?: string;
  /** Disable Continue while parent processes (e.g. Create is firing). */
  busy?: boolean;
}

const STATUS_LABEL: Record<PhotoImportStatus, string> = {
  new: "New",
  staged: "Staged",
  imported: "Imported",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<PhotoImportStatus, string> = {
  new: "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/30",
  staged: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30",
  imported: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30",
};

function isSelectable(photo: PhotoImportPhoto): boolean {
  // Imported photos are not selectable (already fully done).
  // Staged photos are not selectable (already in pipeline; will appear in batch UI).
  // New and Rejected are selectable; rejected requires explicit re-check.
  return photo.status === "new" || photo.status === "rejected";
}

function defaultSelected(photos: PhotoImportPhoto[]): Set<string> {
  return new Set(photos.filter(isSelectable).map((p) => p.name));
}

function authorKey(photo: PhotoImportPhoto): string | null {
  const name = photo.authorAttributions[0]?.displayName?.trim();
  return name ? name : null;
}

export function PickPhotosPhase({
  placeId,
  locationId,
  onSelectionChange,
  onConfirm,
  onSkip,
  title = "Pull photos from Google",
  continueLabel = "Continue",
  busy = false,
}: PickPhotosPhaseProps) {
  const byPlace = usePhotoImportPreviewByPlace(placeId ?? null, { enabled: !!placeId && !locationId });
  const byLocation = usePhotoImportPreview(locationId ?? null, { enabled: !!locationId });
  const query = locationId ? byLocation : byPlace;

  const preview = query.data?.preview;
  const photos = useMemo(() => preview?.photos ?? [], [preview]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const initial = defaultSelected(photos);
    setSelected(initial);
    // Inform the parent on initial population so default-selected photos
    // become available to the parent's Create button without requiring
    // the operator to click an inner Confirm.
    if (onSelectionChange && photos.length > 0) {
      onSelectionChange(Array.from(initial));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
        // Cascade: selecting a photo also selects every other selectable
        // photo by the same author. One author tends to mean one shoot, so
        // operators almost always want them as a batch.
        const target = photos.find((p) => p.name === name);
        const author = target ? authorKey(target) : null;
        if (author) {
          for (const p of photos) {
            if (p.name !== name && isSelectable(p) && authorKey(p) === author) {
              next.add(p.name);
            }
          }
        }
      }
      if (onSelectionChange) onSelectionChange(Array.from(next));
      return next;
    });
  }

  const selectableCount = photos.filter(isSelectable).length;
  const allSelected = selectableCount > 0 && selected.size === selectableCount;

  function selectAll() {
    const all = new Set(photos.filter(isSelectable).map((p) => p.name));
    setSelected(all);
    if (onSelectionChange) onSelectionChange(Array.from(all));
  }
  function clearAll() {
    setSelected(new Set());
    if (onSelectionChange) onSelectionChange([]);
  }

  if (query.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading Google photos…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Failed to load Google photos"}
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
          Google Places API key is not configured on the server. Photo Import is disabled.
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">
            {photos.length} photo{photos.length === 1 ? "" : "s"} returned. Selected photos will be downloaded and queued for cropping.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <button
            type="button"
            onClick={allSelected ? clearAll : selectAll}
            className="rounded-md border border-border px-2 py-1 text-foreground hover:bg-accent"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>
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
                  onChange={() => selectable && toggle(photo.name)}
                />

                <span
                  className={`absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    STATUS_STYLES[photo.status]
                  }`}
                >
                  {STATUS_LABEL[photo.status]}
                </span>
              </div>

              <div className="border-t border-border/60 bg-muted/30 px-2 py-1.5">
                <p className="truncate text-[11px] font-medium text-foreground" title={credit || ""}>
                  {credit || <span className="text-muted-foreground italic">No credit</span>}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="text-sm text-muted-foreground">
          {selected.size} selected
        </div>
        {(onSkip || onConfirm) && (
          <div className="flex items-center gap-2">
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
              >
                Skip
              </button>
            )}
            {onConfirm && (
              <button
                type="button"
                onClick={() =>
                  onConfirm(
                    photos
                      .filter((p) => selected.has(p.name))
                      .map((p) => ({
                        photoName: p.name,
                        photographerCredit: p.authorAttributions[0]?.displayName ?? null,
                      }))
                  )
                }
                disabled={busy}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Working…" : continueLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
