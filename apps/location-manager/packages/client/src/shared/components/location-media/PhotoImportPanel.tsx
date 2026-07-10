import { Camera } from "lucide-react";
import { Button } from "@client/components/ui";
import type { LocationCategory } from "@questurian/lm-shared";
import { MultiVariantCropperModal } from "./modals/MultiVariantCropperModal";
import { AltTextReviewModal } from "./modals/AltTextReviewModal";
import { PhotoImportPickerDialog } from "./PhotoImportPickerDialog";
import { PhotoImportSourceGrid } from "./PhotoImportSourceGrid";
import { usePhotoImportPanel } from "./usePhotoImportPanel";

interface PhotoImportPanelProps {
  locationId: number;
  category: LocationCategory;
  placeId: string | null | undefined;
  hasActiveInstagramStaging?: boolean;
}

export function PhotoImportPanel({ locationId, category, placeId, hasActiveInstagramStaging }: PhotoImportPanelProps) {
  const panel = usePhotoImportPanel({
    category,
    locationId,
    hasActiveInstagramStaging,
  });

  // Hide the panel completely when pulling isn't possible (no placeId, or the
  // Google Photo Import toggle is off) and there are no pending sources. Pending
  // sources stay visible even when the toggle is off — their bytes are already
  // on disk, so cropping them costs nothing.
  if ((!placeId || !panel.photoImportEnabled) && panel.pendingSources.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Image Intake</h3>
        </div>
        {placeId && panel.photoImportEnabled && (
          <Button
            type="button"
            size="sm"
            onClick={() => panel.setPickerOpen(true)}
            disabled={panel.startImport.isPending}
          >
            {panel.startImport.isPending ? "Importing…" : "Pull photos from Google"}
          </Button>
        )}
      </div>

      {!placeId && panel.photoImportEnabled && (
        <p className="text-xs text-muted-foreground">
          Set a Google Place ID on this Location to enable photo import.
        </p>
      )}

      {panel.pendingSources.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Awaiting Review</p>
          <PhotoImportSourceGrid
            sources={panel.pendingSources}
            photoImportEnabled={panel.photoImportEnabled}
            retryPending={panel.retryPending}
            loadingSourceId={panel.loadingSourceId}
            onDelete={panel.handleDelete}
            onRetry={panel.handleRetry}
            onOpenReview={(source) => void panel.handleOpenReview(source)}
          />
        </div>
      )}

      <PhotoImportPickerDialog
        open={panel.pickerOpen}
        locationId={locationId}
        busy={panel.startImport.isPending}
        onOpenChange={panel.setPickerOpen}
        onConfirm={panel.handleConfirmPick}
      />

      {panel.cropState.isOpen && panel.cropState.file && (
        <MultiVariantCropperModal
          file={panel.cropState.file}
          isOpen={panel.cropState.isOpen}
          onClose={panel.closeCropper}
          onConfirm={panel.handleCropConfirm}
        />
      )}
      {panel.altReviewState.isOpen && panel.altReviewState.file && (
        <AltTextReviewModal
          isOpen={panel.altReviewState.isOpen}
          onClose={panel.closeAltReview}
          onConfirm={panel.confirmAltText}
          onRegenerate={panel.regenerateAltText}
          imageFile={panel.altReviewState.file}
          aiGeneratedAltText={panel.altReviewState.generatedText}
          generationError={panel.altReviewState.error ?? undefined}
          isLoading={panel.isGeneratingAltText}
        />
      )}
    </div>
  );
}
