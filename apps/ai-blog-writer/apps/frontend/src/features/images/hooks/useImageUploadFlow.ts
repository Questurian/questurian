import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, RefObject } from 'react';
import type { UploadProgress } from '../api/imagesApi';
import { readFileAsDataUrl, requestGeneratedAltText, uploadPreparedVariants } from '../services/image-upload-flow.service';
import type { ImageUploadProps, UploadMode, VariantUploadFile } from '../types';
import { validateImageFile } from '../validators/image-upload.validators';

export type UseImageUploadFlowResult = {
  mode: UploadMode;
  isDragging: boolean;
  selectedFile: File | null;
  preview: string | null;
  isGeneratingAlt: boolean;
  progress: UploadProgress;
  preparedVariantFiles: VariantUploadFile[] | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  hasPhotographerCredit: boolean;
  setMode: (mode: UploadMode) => void;
  setProgress: (progress: UploadProgress) => void;
  handleDrop: (event: DragEvent) => void;
  handleDragOver: (event: DragEvent) => void;
  handleDragLeave: (event: DragEvent) => void;
  handleInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleClear: () => void;
  handleCropConfirm: (variantFiles: VariantUploadFile[]) => Promise<void>;
  handleStartCropping: () => void;
  handleRegenerateAltText: () => Promise<void>;
  retryUploadPrepared: () => Promise<void>;
  openFilePicker: () => void;
};

export function useImageUploadFlow({
  externalRef,
  locationRef,
  token,
  altText,
  photographerCredit = '',
  onUploadComplete,
  onAltTextGenerated,
}: ImageUploadProps): UseImageUploadFlowResult {
  const [mode, setMode] = useState<UploadMode>('select');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isGeneratingAlt, setIsGeneratingAlt] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({
    status: 'idle',
    progress: 0,
    message: '',
  });
  const [preparedVariantFiles, setPreparedVariantFiles] = useState<VariantUploadFile[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasPhotographerCredit = photographerCredit.trim().length > 0;

  const requestAltText = useCallback(async (file: File) => {
    if (!onAltTextGenerated) return;

    setIsGeneratingAlt(true);
    try {
      const generatedAlt = await requestGeneratedAltText(file);
      onAltTextGenerated(generatedAlt);
    } catch (error) {
      console.error('Alt text generation failed:', error);
    } finally {
      setIsGeneratingAlt(false);
    }
  }, [onAltTextGenerated]);

  const handleFileSelect = useCallback(async (file: File) => {
    const error = validateImageFile(file);
    if (error) {
      setProgress({
        status: 'error',
        progress: 0,
        message: error,
      });
      return;
    }

    setSelectedFile(file);
    setProgress({ status: 'idle', progress: 0, message: '' });
    setMode('alttext');

    try {
      const previewDataUrl = await readFileAsDataUrl(file);
      setPreview(previewDataUrl);
    } catch {
      setPreview(null);
    }

    await requestAltText(file);
  }, [requestAltText]);

  const uploadPrepared = useCallback(async (variantFiles: VariantUploadFile[]) => {
    setMode('uploading');

    try {
      const result = await uploadPreparedVariants({
        variantFiles,
        externalRef,
        altText,
        locationRef,
        token,
        photographerCredit,
        onProgress: setProgress,
      });
      onUploadComplete(result);
    } catch (error) {
      setProgress({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Upload failed',
      });
      setMode(selectedFile ? 'alttext' : 'select');
    }
  }, [altText, externalRef, locationRef, onUploadComplete, photographerCredit, selectedFile, token]);

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      void handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setPreview(null);
    setPreparedVariantFiles(null);
    setMode('select');
    setProgress({ status: 'idle', progress: 0, message: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleCropConfirm = useCallback(async (variantFiles: VariantUploadFile[]) => {
    setPreparedVariantFiles(variantFiles);
    await uploadPrepared(variantFiles);
  }, [uploadPrepared]);

  const handleStartCropping = useCallback(() => {
    if (!selectedFile) return;
    if (!altText.trim() || !hasPhotographerCredit || isGeneratingAlt) return;
    setMode('crop');
  }, [altText, hasPhotographerCredit, isGeneratingAlt, selectedFile]);

  const handleRegenerateAltText = useCallback(async () => {
    if (!selectedFile) return;
    await requestAltText(selectedFile);
  }, [requestAltText, selectedFile]);

  const retryUploadPrepared = useCallback(async () => {
    if (!preparedVariantFiles) return;
    await uploadPrepared(preparedVariantFiles);
  }, [preparedVariantFiles, uploadPrepared]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    mode,
    isDragging,
    selectedFile,
    preview,
    isGeneratingAlt,
    progress,
    preparedVariantFiles,
    fileInputRef,
    hasPhotographerCredit,
    setMode,
    setProgress,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleInputChange,
    handleClear,
    handleCropConfirm,
    handleStartCropping,
    handleRegenerateAltText,
    retryUploadPrepared,
    openFilePicker,
  };
}
