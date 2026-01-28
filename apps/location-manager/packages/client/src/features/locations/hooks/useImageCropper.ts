import { useState, useCallback, useEffect } from "react";
import type { Point, Area } from "react-easy-crop";
import { createCroppedImage, type CropData, type TargetDimensions } from "../utils/image-processing";

// Target dimensions for landscape 16:9 ratio
const LANDSCAPE_DIMENSIONS: TargetDimensions = {
  width: 1920,
  height: 1080,
};

// Locked aspect ratio
const ASPECT_RATIO = 16 / 9;

interface UseImageCropperProps {
  file: File;
}

export function useImageCropper({ file }: UseImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // Create object URL for preview
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Handle crop complete callback from react-easy-crop
  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // Process the crop and return the cropped File
  const processCrop = useCallback(async (): Promise<File | null> => {
    if (!croppedAreaPixels) {
      setError("No crop area selected");
      return null;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const cropData: CropData = {
        x: croppedAreaPixels.x,
        y: croppedAreaPixels.y,
        width: croppedAreaPixels.width,
        height: croppedAreaPixels.height,
      };

      const croppedFile = await createCroppedImage(
        previewUrl,
        cropData,
        LANDSCAPE_DIMENSIONS,
        file.name
      );

      setIsProcessing(false);
      return croppedFile;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to process crop";
      setError(errorMessage);
      setIsProcessing(false);
      return null;
    }
  }, [croppedAreaPixels, previewUrl, file.name]);

  return {
    crop,
    setCrop,
    zoom,
    setZoom,
    aspectRatio: ASPECT_RATIO,
    onCropComplete,
    processCrop,
    isProcessing,
    error,
    previewUrl,
  };
}
