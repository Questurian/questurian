import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Upload, Clock3 } from 'lucide-react';
import { type ImageVariantType, VARIANT_SPECS } from '@questurian/lm-shared';
import { FormInput } from '@client/shared/components/forms';
import { Button } from '@client/components/ui/button';
import { useToast } from '@client/shared/hooks/useToast';
import { useAddUploadImageSet } from '@client/shared/services/api/hooks/useAddUploadImageSet';
import { useGenerateAltText } from '@client/shared/services/api/hooks/useGenerateAltText';
import { useLocationById } from '@client/shared/services/api/hooks/useLocationById';
import type { Category } from '@client/shared/services/api/types';
import type { ImageVariantUploadFile, QueuedImageSetPayload } from '@client/shared/types/location-media.types';
import { ImagePreviewGrid } from '../ui/ImagePreviewGrid';
import { MultiVariantCropperModal } from '../modals/MultiVariantCropperModal';
import { AltTextReviewModal } from '../modals/AltTextReviewModal';
import {
  addUploadFilesSchema,
  type AddUploadFilesFormData,
} from '../validation/add-upload-files.schema';

interface AddUploadFilesFormProps {
  category?: Category;
  locationId?: number;
  defaultPhotographerCredit?: string;
  onQueueImageSet?: (payload: QueuedImageSetPayload) => void;
}

interface ProcessedImageSet {
  sourceFile: File;
  variantFiles: ImageVariantUploadFile[];
  altText?: string;
}

export function AddUploadFilesForm({
  category,
  locationId,
  defaultPhotographerCredit,
  onQueueImageSet,
}: AddUploadFilesFormProps) {
  const { showToast } = useToast();
  const variantCount = Object.keys(VARIANT_SPECS).length;
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedImageSets, setProcessedImageSets] = useState<(ProcessedImageSet | null)[]>([]);
  const [cropModalState, setCropModalState] = useState<{
    isOpen: boolean;
    fileIndex: number | null;
  }>({ isOpen: false, fileIndex: null });
  const [altTextModalState, setAltTextModalState] = useState<{
    isOpen: boolean;
    fileIndex: number | null;
    aiGeneratedText: string;
  }>({ isOpen: false, fileIndex: null, aiGeneratedText: '' });
  const [confirmedAltTexts, setConfirmedAltTexts] = useState<(string | undefined)[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: location } = useLocationById(locationId ?? null, category ?? null);

  const form = useForm<AddUploadFilesFormData>({
    resolver: zodResolver(addUploadFilesSchema),
    defaultValues: {
      photographerCredit: '',
    },
  });

  useEffect(() => {
    const preferredCredit = location?.title || defaultPhotographerCredit || '';
    if (preferredCredit && !form.getValues('photographerCredit')) {
      form.setValue('photographerCredit', preferredCredit);
    }
  }, [location?.title, defaultPhotographerCredit, form]);

  const { mutate: generateAltText, isPending: isGeneratingAltText } = useGenerateAltText({
    onSuccess: (data) => {
      if (altTextModalState.fileIndex !== null) {
        setAltTextModalState((prev) => ({
          ...prev,
          aiGeneratedText: data.altText,
        }));
      }
    },
    onError: (error) => {
      console.warn('Failed to generate alt text:', error);
      if (altTextModalState.fileIndex !== null) {
        setAltTextModalState((prev) => ({
          ...prev,
          aiGeneratedText: '',
        }));
      }
    },
  });

  const { mutate, isPending, uploadProgress } = useAddUploadImageSet(category ?? null, locationId ?? 0, {
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(`Image set uploaded successfully (${variantCount} variants)`, centerPosition);
      handleReset();
    },
    onError: (error: Error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || 'Failed to upload image set', centerPosition);
    },
  });

  const isUploadMode = typeof locationId === 'number' && !!category;
  const photographerCreditValue = form.watch('photographerCredit') || '';
  const hasValidPhotographerCredit = photographerCreditValue.trim().length > 0;

  function handleFileSelect(files: FileList | null) {
    if (!files) return;
    const fileArray = Array.from(files);
    const startIndex = selectedFiles.length;

    setSelectedFiles((prev) => [...prev, ...fileArray]);
    setProcessedImageSets((prev) => [...prev, ...new Array(fileArray.length).fill(null)]);
    setConfirmedAltTexts((prev) => [...prev, ...new Array(fileArray.length).fill(undefined)]);

    setAltTextModalState({
      isOpen: true,
      fileIndex: startIndex,
      aiGeneratedText: '',
    });

    if (fileArray.length > 0) {
      generateAltText(fileArray[0]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleRemoveFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setProcessedImageSets((prev) => prev.filter((_, i) => i !== index));
    setConfirmedAltTexts((prev) => prev.filter((_, i) => i !== index));

    if (cropModalState.fileIndex === index) {
      setCropModalState({ isOpen: false, fileIndex: null });
    }
    if (altTextModalState.fileIndex === index) {
      setAltTextModalState({ isOpen: false, fileIndex: null, aiGeneratedText: '' });
    }
  }

  function handleReset() {
    setSelectedFiles([]);
    setProcessedImageSets([]);
    setConfirmedAltTexts([]);
    setCropModalState({ isOpen: false, fileIndex: null });
    setAltTextModalState({ isOpen: false, fileIndex: null, aiGeneratedText: '' });
    form.reset();

    const preferredCredit = location?.title || defaultPhotographerCredit || '';
    if (preferredCredit) {
      form.setValue('photographerCredit', preferredCredit);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleSubmit(data: AddUploadFilesFormData) {
    if (!areAllFilesCropped()) return;
    const normalizedPhotographerCredit = data.photographerCredit.trim();
    if (!normalizedPhotographerCredit) return;

    const imageSet = processedImageSets[0];
    if (!imageSet) return;

    const altText = confirmedAltTexts[0];
    const payload: QueuedImageSetPayload = {
      sourceFile: imageSet.sourceFile,
      variantFiles: imageSet.variantFiles,
      photographerCredit: normalizedPhotographerCredit,
      altText,
    };

    if (!isUploadMode) {
      if (!onQueueImageSet) {
        const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        showToast('Unable to queue image set before document creation.', centerPosition);
        return;
      }

      onQueueImageSet(payload);
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast('Image set queued. It will upload after document creation.', centerPosition);
      handleReset();
      return;
    }

    mutate(payload);
  }

  function handleCropImage(index: number) {
    setCropModalState({ isOpen: true, fileIndex: index });
  }

  function handleCropConfirm(
    sourceFile: File,
    variantFiles: { type: ImageVariantType; file: File }[]
  ) {
    if (cropModalState.fileIndex === null) return;

    setProcessedImageSets((prev) => {
      const updated = [...prev];
      updated[cropModalState.fileIndex!] = { sourceFile, variantFiles };
      return updated;
    });

    const nextUncropped = findNextUncroppedIndex(cropModalState.fileIndex + 1);
    if (nextUncropped !== null) {
      setCropModalState({ isOpen: true, fileIndex: nextUncropped });
    } else {
      setCropModalState({ isOpen: false, fileIndex: null });
    }
  }

  function findNextUncroppedIndex(startIndex: number): number | null {
    for (let i = startIndex; i < selectedFiles.length; i++) {
      if (!processedImageSets[i]) return i;
    }
    return null;
  }

  function handleAltTextConfirm(altText: string) {
    if (altTextModalState.fileIndex === null) return;

    setConfirmedAltTexts((prev) => {
      const updated = [...prev];
      updated[altTextModalState.fileIndex!] = altText;
      return updated;
    });

    setAltTextModalState({ isOpen: false, fileIndex: null, aiGeneratedText: '' });
    setCropModalState({ isOpen: true, fileIndex: altTextModalState.fileIndex });
  }

  function handleAltTextCancel() {
    if (altTextModalState.fileIndex !== null) {
      handleRemoveFile(altTextModalState.fileIndex);
    }
    setAltTextModalState({ isOpen: false, fileIndex: null, aiGeneratedText: '' });
  }

  function areAllFilesCropped(): boolean {
    return (
      selectedFiles.length > 0 &&
      selectedFiles.every((_, i) => processedImageSets[i] !== null)
    );
  }

  function hasCroppedImages(): boolean {
    return processedImageSets.some((set) => set !== null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit(handleSubmit)(event);
  }

  return (
    <div className="border rounded-lg p-4 bg-muted/50 space-y-3 min-h-[368px]">
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        {isUploadMode ? 'Add Images' : 'Queue Images'}
        {!isUploadMode && <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />}
      </h4>

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
