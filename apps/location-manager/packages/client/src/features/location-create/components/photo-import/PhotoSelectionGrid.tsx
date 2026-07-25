import { ImageOff } from "lucide-react";
import type { PhotoImportPhoto, PhotoImportStatus } from "@questurian/lm-shared";
import { isSelectablePhoto } from "./photo-import-crop.utils";

const STATUS_LABEL: Record<PhotoImportStatus, string> = {
  new: "New",
  staged: "Staged",
  imported: "Imported",
  rejected: "Rejected",
};

interface PhotoSelectionGridProps {
  photos: PhotoImportPhoto[];
  selected: Set<string>;
  onTogglePhoto: (name: string) => void;
  onSelectPhotos: (names: string[]) => void;
  onContinue: () => void;
  onSkip?: () => void;
}

export function PhotoSelectionGrid({
  photos,
  selected,
  onTogglePhoto,
  onSelectPhotos,
  onContinue,
  onSkip,
}: PhotoSelectionGridProps) {
  const selectablePhotos = photos.filter(isSelectablePhoto);
  const allSelected = selectablePhotos.length > 0 && selected.size === selectablePhotos.length;

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
          onClick={() => onSelectPhotos(
            allSelected ? [] : selectablePhotos.map((photo) => photo.name)
          )}
          className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {photos.map((photo) => {
          const selectable = isSelectablePhoto(photo);
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
                  onChange={() => selectable && onTogglePhoto(photo.name)}
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
            onClick={onContinue}
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
