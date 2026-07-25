import { Upload, Clock3, ShieldCheck } from 'lucide-react';
import { FormInput } from '@client/shared/components/forms';
import { Button } from '@client/components/ui/button';
import type { Category } from '@client/shared/services/api/types';
import type { QueuedImageSetPayload } from '@client/shared/types/location-media.types';
import { ImagePreviewGrid } from '../ui/ImagePreviewGrid';
import { MultiVariantCropperModal } from '../modals/MultiVariantCropperModal';
import { AltTextReviewModal } from '../modals/AltTextReviewModal';
import { useAddUploadFilesForm } from './useAddUploadFilesForm';

interface AddUploadFilesFormProps {
  category?: Category;
  locationId?: number;
  defaultPhotographerCredit?: string;
  onQueueImageSet?: (payload: QueuedImageSetPayload) => void;
}

export function AddUploadFilesForm({
  category,
  locationId,
  defaultPhotographerCredit,
  onQueueImageSet,
}: AddUploadFilesFormProps) {
  const {
    form,
    fileInputRef,
    variantCount,
    isUploadMode,
    isPending,
    uploadProgress,
    isGeneratingAltText,
    selectedFiles,
    processedImageSets,
    cropModalState,
    setCropModalState,
    altTextModalState,
    altTextGenerationError,
    isDragging,
    showMetadataCleanedBadge,
    hasValidPhotographerCredit,
    handleFileSelect,
    handleRemoveFile,
    handleReset,
    handleCropImage,
    handleCropConfirm,
    handleAltTextConfirm,
    handleAltTextCancel,
    areAllFilesCropped,
    hasCroppedImages,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFormSubmit,
  } = useAddUploadFilesForm({
    category,
    locationId,
    defaultPhotographerCredit,
    onQueueImageSet,
  });

  return (
    <div className="border rounded-lg p-4 bg-muted/50 space-y-3 min-h-[368px]">
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        {isUploadMode ? 'Add Images' : 'Queue Images'}
        {!isUploadMode && <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />}
      </h4>
      {showMetadataCleanedBadge && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>Image metadata cleaned on upload</span>
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="space-y-3">
        {!hasCroppedImages() && (
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag and drop images here, or click to select
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadMode && isPending}
            >
              Choose Files
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              {selectedFiles.length} file(s) selected
            </p>
          </div>
        )}

        {selectedFiles.length > 0 && (
          <ImagePreviewGrid
            files={selectedFiles}
            onRemove={handleRemoveFile}
            onCrop={handleCropImage}
            croppedIndicators={processedImageSets.map((set) => set !== null)}
          />
        )}

        <FormInput
          control={form.control}
          name="photographerCredit"
          label="Photographer Credit *"
          placeholder="Name, studio, or publication"
        />

        {isUploadMode && isPending && uploadProgress > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={(isUploadMode && isPending) || !areAllFilesCropped() || !hasValidPhotographerCredit}
            size="sm"
          >
            {isUploadMode && isPending
              ? `Uploading... ${uploadProgress}%`
              : areAllFilesCropped()
                ? isUploadMode
                  ? `Upload Image Set (${variantCount} variants)`
                  : `Queue Image Set (${variantCount} variants)`
                : `Crop ${selectedFiles.length - processedImageSets.filter(Boolean).length} more image(s)`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isUploadMode && isPending}
            size="sm"
          >
            Clear
          </Button>
        </div>
      </form>

      {altTextModalState.isOpen && altTextModalState.fileIndex !== null && (
        <AltTextReviewModal
          isOpen={altTextModalState.isOpen}
          onClose={handleAltTextCancel}
          onConfirm={handleAltTextConfirm}
          imageFile={selectedFiles[altTextModalState.fileIndex]}
          aiGeneratedAltText={altTextModalState.aiGeneratedText}
          generationError={altTextGenerationError || undefined}
          isLoading={isGeneratingAltText}
        />
      )}

      {cropModalState.isOpen && cropModalState.fileIndex !== null && (
        <MultiVariantCropperModal
          file={selectedFiles[cropModalState.fileIndex]}
          isOpen={cropModalState.isOpen}
          onClose={() => setCropModalState({ isOpen: false, fileIndex: null })}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
