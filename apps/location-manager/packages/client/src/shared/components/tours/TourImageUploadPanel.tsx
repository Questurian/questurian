import { Button, Input, Label } from "@client/components/ui";
import { AltTextReviewModal } from "@client/shared/components/location-media/modals/AltTextReviewModal";
import { MultiVariantCropperModal } from "@client/shared/components/location-media/modals/MultiVariantCropperModal";
import { Image, Loader2, Upload, X } from "lucide-react";
import { useTourImageUpload } from "./hooks/useTourImageUpload";

interface TourImageUploadPanelProps {
  title: string;
  sourceImageUrl?: string | null;
  sourceProvider?: string | null;
  onUploaded: (mediaSetId: string) => void;
  onLocalImageStateChange?: (hasLocalImage: boolean) => void;
  onUploadPendingChange?: (isPending: boolean) => void;
}

export function TourImageUploadPanel({
  title,
  sourceImageUrl,
  sourceProvider,
  onUploaded,
  onLocalImageStateChange,
  onUploadPendingChange,
}: TourImageUploadPanelProps) {
  const upload = useTourImageUpload({
    title,
    sourceImageUrl,
    sourceProvider,
    onUploaded,
    onLocalImageStateChange,
    onUploadPendingChange,
  });

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Upload new photo</p>
          <p className="text-xs text-muted-foreground">
            Crop the same seven variants used by Location Manager image uploads.
          </p>
        </div>
        {upload.sourceFile && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={upload.resetUploadState}
            disabled={upload.uploadTourMediaSet.isPending}
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {!upload.sourceFile ? (
        <div
          className={`rounded-md border border-dashed bg-background p-5 text-center transition-colors ${
            upload.isDragging ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={upload.handleDragOver}
          onDragLeave={upload.handleDragLeave}
          onDrop={upload.handleDrop}
        >
          <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {upload.downloadSourceImage.isPending
              ? "Downloading source image..."
              : "Drag and drop one source photo here, or click to choose."}
          </p>
          {upload.fileError && <p className="mt-2 text-xs text-destructive">{upload.fileError}</p>}
          <input
            ref={upload.fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => upload.handleFileSelect(event.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => upload.fileInputRef.current?.click()}
          >
            Choose photo
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
              <Image className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="line-clamp-2 break-all text-sm font-medium leading-5 text-foreground"
                title={upload.sourceFile.name}
              >
                {upload.sourceFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {upload.hasCrops ? "All variants cropped" : "Needs crop review"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => upload.setCropModalOpen(true)}
              disabled={!upload.sourceFile || upload.uploadTourMediaSet.isPending}
              className="col-span-2 w-full sm:col-span-1 sm:w-auto"
            >
              {upload.hasCrops ? "Adjust crops" : "Crop"}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Photographer credit</Label>
            <Input
              value={upload.photographerCredit}
              onChange={(event) => upload.setPhotographerCredit(event.target.value)}
              placeholder="Name, studio, or publication"
              disabled={upload.uploadTourMediaSet.isPending}
            />
          </div>

          {upload.uploadTourMediaSet.isPending && upload.uploadTourMediaSet.uploadProgress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading media set...</span>
                <span>{upload.uploadTourMediaSet.uploadProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${upload.uploadTourMediaSet.uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {upload.uploadTourMediaSet.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
              <p className="text-sm font-medium text-destructive">
                {upload.uploadTourMediaSet.error.message}
              </p>
            </div>
          )}

          <Button
            type="button"
            onClick={upload.handleUpload}
            disabled={!upload.canUpload || upload.uploadTourMediaSet.isPending}
            size="sm"
          >
            {upload.uploadTourMediaSet.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Upload and use photo
          </Button>
        </div>
      )}

      {upload.sourceFile && upload.altTextModalOpen && (
        <AltTextReviewModal
          isOpen={upload.altTextModalOpen}
          onClose={upload.resetUploadState}
          onConfirm={upload.handleAltTextConfirm}
          imageFile={upload.sourceFile}
          aiGeneratedAltText={upload.aiGeneratedAltText}
          generationError={upload.altTextGenerationError || undefined}
          isLoading={upload.isGeneratingAltText}
        />
      )}

      {upload.sourceFile && upload.cropModalOpen && (
        <MultiVariantCropperModal
          file={upload.sourceFile}
          isOpen={upload.cropModalOpen}
          onClose={() => upload.setCropModalOpen(false)}
          onConfirm={upload.handleCropConfirm}
        />
      )}
    </div>
  );
}
