import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { VARIANT_SPECS } from '@questurian/lm-shared';
import { useToast } from '@client/shared/hooks/useToast';
import { useAddUploadImageSet } from '@client/shared/services/api/hooks/useAddUploadImageSet';
import { useGenerateAltText } from '@client/shared/services/api/hooks/useGenerateAltText';
import { useLocationById } from '@client/shared/services/api/hooks/useLocationById';
import type { Category } from '@client/shared/services/api/types';
import type { ImageVariantUploadFile, QueuedImageSetPayload } from '@client/shared/types/location-media.types';
import {
  addUploadFilesSchema,
  type AddUploadFilesFormData,
} from '../validation/add-upload-files.schema';

interface ProcessedImageSet {
  sourceFile: File;
  variantFiles: ImageVariantUploadFile[];
  altText?: string;
}

interface UseAddUploadFilesFormArgs {
  category?: Category;
  locationId?: number;
  defaultPhotographerCredit?: string;
  onQueueImageSet?: (payload: QueuedImageSetPayload) => void;
}

/**
 * Drives the add/queue image-set form.
 *
 * Selecting files starts a per-file pipeline: alt-text review, then cropping
 * into every variant. Both are tracked as index-parallel arrays alongside
 * `selectedFiles`, so removing a file has to splice all three together.
 *
 * With a locationId + category the form uploads directly; without them it
 * hands the finished image set to `onQueueImageSet` to upload after the parent
 * document is created.
 */
export function useAddUploadFilesForm({
  category,
  locationId,
  defaultPhotographerCredit,
  onQueueImageSet,
}: UseAddUploadFilesFormArgs) {
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
  const [altTextGenerationError, setAltTextGenerationError] = useState<string | null>(null);
  const [confirmedAltTexts, setConfirmedAltTexts] = useState<(string | undefined)[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showMetadataCleanedBadge, setShowMetadataCleanedBadge] = useState(false);
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
      setAltTextGenerationError(null);
      if (altTextModalState.fileIndex !== null) {
        setAltTextModalState((prev) => ({
          ...prev,
          aiGeneratedText: data.altText,
        }));
      }
    },
    onError: (error) => {
      console.warn('Failed to generate alt text:', error);
      setAltTextGenerationError('AI alt text unavailable. Enter alt text manually.');
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast('AI alt text unavailable. Enter alt text manually.', centerPosition);
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
      showToast(`Image set uploaded. Image metadata cleaned. (${variantCount} variants)`, centerPosition);
      handleReset();
      setShowMetadataCleanedBadge(true);
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

    setShowMetadataCleanedBadge(false);
    setSelectedFiles((prev) => [...prev, ...fileArray]);
    setProcessedImageSets((prev) => [...prev, ...new Array(fileArray.length).fill(null)]);
    setConfirmedAltTexts((prev) => [...prev, ...new Array(fileArray.length).fill(undefined)]);

    setAltTextModalState({
      isOpen: true,
      fileIndex: startIndex,
      aiGeneratedText: '',
    });
    setAltTextGenerationError(null);

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
    setAltTextGenerationError(null);
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
    variantFiles: ImageVariantUploadFile[]
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
    setAltTextGenerationError(null);
    setCropModalState({ isOpen: true, fileIndex: altTextModalState.fileIndex });
  }

  function handleAltTextCancel() {
    if (altTextModalState.fileIndex !== null) {
      handleRemoveFile(altTextModalState.fileIndex);
    }
    setAltTextModalState({ isOpen: false, fileIndex: null, aiGeneratedText: '' });
    setAltTextGenerationError(null);
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

  return {
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
  };
}
