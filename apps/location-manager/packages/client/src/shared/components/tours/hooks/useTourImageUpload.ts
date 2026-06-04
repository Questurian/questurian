import { useEffect, useRef, useState } from "react";
import {
  useDownloadTourSourceImage,
  useGenerateAltText,
  useUploadTourMediaSet,
} from "@client/shared/services/api/hooks";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import type { ProcessedTourImageSet } from "../TourFormDialog.types";

interface UseTourImageUploadParams {
  title: string;
  sourceImageUrl?: string | null;
  sourceProvider?: string | null;
  onUploaded: (mediaSetId: string) => void;
  onLocalImageStateChange?: (hasLocalImage: boolean) => void;
  onUploadPendingChange?: (isPending: boolean) => void;
}

function toFileList(file: File): FileList {
  return {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
  } as unknown as FileList;
}

export function useTourImageUpload({
  title,
  sourceImageUrl,
  sourceProvider,
  onUploaded,
  onLocalImageStateChange,
  onUploadPendingChange,
}: UseTourImageUploadParams) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [processedImageSet, setProcessedImageSet] = useState<ProcessedTourImageSet | null>(null);
  const [photographerCredit, setPhotographerCredit] = useState("");
  const [altTextModalOpen, setAltTextModalOpen] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [aiGeneratedAltText, setAiGeneratedAltText] = useState("");
  const [altTextGenerationError, setAltTextGenerationError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const uploadTourMediaSet = useUploadTourMediaSet();
  const downloadSourceImage = useDownloadTourSourceImage();
  const { mutate: generateAltText, isPending: isGeneratingAltText } = useGenerateAltText({
    onSuccess: (data) => {
      setAiGeneratedAltText(data.altText);
      setAltTextGenerationError(null);
    },
    onError: () => {
      setAiGeneratedAltText("");
      setAltTextGenerationError("AI alt text unavailable. Enter alt text manually.");
    },
  });

  useEffect(() => {
    if (!sourceProvider || photographerCredit.trim()) return;
    setPhotographerCredit(sourceProvider === "viator" ? "Viator" : sourceProvider);
  }, [sourceProvider, photographerCredit]);

  function resetUploadState() {
    setSourceFile(null);
    setProcessedImageSet(null);
    setAltTextModalOpen(false);
    setCropModalOpen(false);
    setAiGeneratedAltText("");
    setAltTextGenerationError(null);
    setFileError(null);
    setIsDragging(false);
    onLocalImageStateChange?.(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileSelect(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFileError("Drop or choose an image file.");
      return;
    }

    setSourceFile(file);
    setProcessedImageSet(null);
    setAiGeneratedAltText("");
    setAltTextGenerationError(null);
    setFileError(null);
    setIsDragging(false);
    onLocalImageStateChange?.(true);
    setAltTextModalOpen(true);
    generateAltText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!sourceImageUrl || sourceFile || downloadSourceImage.isPending) return;
    downloadSourceImage.mutate(sourceImageUrl, {
      onSuccess: (file) => handleFileSelect(toFileList(file)),
      onError: (error) => {
        setFileError(error instanceof Error ? error.message : "Could not download source image.");
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceImageUrl]);

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    handleFileSelect(event.dataTransfer.files);
  }

  function handleAltTextConfirm(altText: string) {
    if (!sourceFile) return;
    setProcessedImageSet({
      sourceFile,
      variantFiles: [],
      altText,
    });
    setAltTextModalOpen(false);
    setCropModalOpen(true);
  }

  function handleCropConfirm(croppedSourceFile: File, variantFiles: ImageVariantUploadFile[]) {
    setProcessedImageSet((current) => ({
      sourceFile: croppedSourceFile,
      variantFiles,
      altText: current?.altText,
    }));
    setCropModalOpen(false);
  }

  function handleUpload() {
    if (!processedImageSet || processedImageSet.variantFiles.length === 0) return;
    const normalizedTitle = title.trim();
    const normalizedCredit = photographerCredit.trim();
    if (!normalizedTitle || !normalizedCredit) return;

    onUploadPendingChange?.(true);
    uploadTourMediaSet.mutate(
      {
        title: normalizedTitle,
        sourceFile: processedImageSet.sourceFile,
        variantFiles: processedImageSet.variantFiles,
        photographerCredit: normalizedCredit,
        altText: processedImageSet.altText,
      },
      {
        onSuccess: ({ mediaSetId }) => {
          onUploaded(mediaSetId);
          onLocalImageStateChange?.(false);
          resetUploadState();
        },
        onError: () => onUploadPendingChange?.(false),
        onSettled: () => onUploadPendingChange?.(false),
      }
    );
  }

  const hasCrops = Boolean(processedImageSet && processedImageSet.variantFiles.length > 0);
  const canUpload = hasCrops && title.trim().length > 0 && photographerCredit.trim().length > 0;

  return {
    aiGeneratedAltText,
    altTextGenerationError,
    altTextModalOpen,
    canUpload,
    cropModalOpen,
    downloadSourceImage,
    fileError,
    fileInputRef,
    handleAltTextConfirm,
    handleCropConfirm,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileSelect,
    handleUpload,
    hasCrops,
    isDragging,
    isGeneratingAltText,
    photographerCredit,
    resetUploadState,
    setCropModalOpen,
    setPhotographerCredit,
    sourceFile,
    uploadTourMediaSet,
  };
}
