/**
 * Add-time Photo Import flow.
 *
 * Selection, seven-variant cropping, IndexedDB-backed session persistence, and
 * atomic Create readiness are delegated to focused feature modules below.
 */

import { useMemo } from "react";
import { Camera, ImageOff, Loader2 } from "lucide-react";
import {
  usePhotoImportPreview,
  usePhotoImportPreviewByPlace,
} from "@client/shared/services/api";
import { PhotoCropGrid } from "./photo-import/PhotoCropGrid";
import { PhotoSelectionGrid } from "./photo-import/PhotoSelectionGrid";
import { usePhotoCropWorkflow } from "./photo-import/use-photo-crop-workflow";
import { usePhotoImportSession } from "./photo-import/use-photo-import-session";
import type { PhotoImportPhaseProps } from "./photo-import/photo-import-phase.types";

export type {
  CroppedPhotoSource,
  PhotoImportSessionState,
} from "./photo-import/photo-import-phase.types";

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
  const session = usePhotoImportSession({
    photos,
    category,
    onSessionChange,
  });
  const cropWorkflow = usePhotoCropWorkflow({
    sessionId: session.sessionId,
    selected: session.selected,
    cards: session.cards,
    setCards: session.setCards,
  });

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
          {byPlace.error instanceof Error
            ? byPlace.error.message
            : "Failed to load Google photos"}
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

  if (session.subPhase === "select") {
    return (
      <PhotoSelectionGrid
        photos={photos}
        selected={session.selected}
        onTogglePhoto={session.togglePhoto}
        onSelectPhotos={session.selectPhotos}
        onContinue={session.goToCrop}
        onSkip={onSkip}
      />
    );
  }

  return (
    <PhotoCropGrid
      selected={session.selected}
      cards={session.cards}
      activeSourceName={cropWorkflow.activeSourceName}
      activeSourceFile={cropWorkflow.activeSourceFile}
      onBack={() => session.setSubPhase("select")}
      onRemoveSource={session.removeSource}
      onOpenCropper={cropWorkflow.openCropper}
      onAutoCropSource={cropWorkflow.autoCropSource}
      onAutoCropAll={cropWorkflow.autoCropAll}
      onCropCancel={cropWorkflow.closeCropper}
      onCropConfirm={cropWorkflow.confirmCrop}
    />
  );
}
