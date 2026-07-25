import { useState, useCallback, useEffect } from "react";
import type { Point, Area } from "react-easy-crop";
import { type ImageVariantType, VARIANT_SPECS } from "@questurian/lm-shared";
import { useToast } from "@client/shared/hooks/useToast";
import {
  createMultiVariantImages,
  createRotatedSourceImage,
} from "@client/shared/lib/image-processing";
import type {
  CropState,
  ImageVariantUploadFile,
} from "@client/shared/types/location-media.types";
import {
  clampStraightenAngle,
  centeredCropArea,
  createInitialCropStates,
  loadImageSize,
  normalizeDegrees,
  rotatedBoundingBox,
  variantSequence,
} from "./multiVariantCropper.geometry";

interface UseMultiVariantCropperArgs {
  file: File;
  onConfirm: (
    sourceFile: File,
    variantFiles: ImageVariantUploadFile[],
    photographerCredit?: string
  ) => void;
  initialPhotographerCredit?: string;
}

/**
 * Crop state, orientation, and confirmation flow for the multi-variant cropper.
 *
 * Holds one {@link CropState} per variant in `variantSequence` and keeps the
 * active variant's crop in sync with react-easy-crop. Changing orientation
 * resets every crop, since existing pixel areas no longer map to the rotated
 * image's coordinate space.
 */
export function useMultiVariantCropper({
  file,
  onConfirm,
  initialPhotographerCredit,
}: UseMultiVariantCropperArgs) {
  const { showToast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAutoCropping, setIsAutoCropping] = useState(false);
  const [baseRotation, setBaseRotation] = useState(0);
  const [straightenAngle, setStraightenAngle] = useState(0);
  const showCreditField = initialPhotographerCredit !== undefined;
  const [photographerCredit, setPhotographerCredit] = useState(initialPhotographerCredit ?? "");

  useEffect(() => {
    setPhotographerCredit(initialPhotographerCredit ?? "");
  }, [initialPhotographerCredit, file]);

  // Initialize crop states for all variants
  const [cropStates, setCropStates] = useState<Record<ImageVariantType, CropState>>(() => createInitialCropStates());

  const currentVariantType = variantSequence[currentVariantIndex];
  const currentState = cropStates[currentVariantType];
  const currentSpec = VARIANT_SPECS[currentVariantType];
  const totalVariants = variantSequence.length;
  const fileIdentity = `${file.name}:${file.lastModified}:${file.size}`;
  const rotation = baseRotation + straightenAngle;

  // Create preview URL when file changes
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  // Reset cropper progress when switching to a different source file.
  useEffect(() => {
    setCurrentVariantIndex(0);
    setIsProcessing(false);
    setIsAutoCropping(false);
    setBaseRotation(0);
    setStraightenAngle(0);
    setCropStates(createInitialCropStates());
  }, [file]);

  const updateVariantState = useCallback(
    (variantType: ImageVariantType, updates: Partial<CropState>) => {
      setCropStates((prev) => ({
        ...prev,
        [variantType]: { ...prev[variantType], ...updates },
      }));
    },
    []
  );

  // Update crop position for current variant
  const onCropChange = useCallback((crop: Point) => {
    updateVariantState(currentVariantType, { crop });
  }, [currentVariantType, updateVariantState]);

  // Update zoom for current variant
  const onZoomChange = useCallback((zoom: number) => {
    updateVariantState(currentVariantType, { zoom });
  }, [currentVariantType, updateVariantState]);

  // Persist the pixel crop continuously to avoid stale area when switching tabs quickly.
  const onCropAreaChange = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    updateVariantState(currentVariantType, { croppedAreaPixels, completed: true });
  }, [currentVariantType, updateVariantState]);

  const applyOrientation = useCallback((nextBaseRotation: number, nextStraightenAngle: number) => {
    const normalizedStraightenAngle = clampStraightenAngle(nextStraightenAngle);

    if (
      Math.abs(nextBaseRotation - baseRotation) < 0.001 &&
      Math.abs(normalizedStraightenAngle - straightenAngle) < 0.001
    ) {
      return;
    }

    const shouldNotifyReset = currentVariantIndex > 0 || variantSequence.some(
      (type, index) => index !== currentVariantIndex && cropStates[type].croppedAreaPixels !== null
    );

    setBaseRotation(nextBaseRotation);
    setStraightenAngle(normalizedStraightenAngle);
    setCropStates(createInitialCropStates());
    setCurrentVariantIndex(0);

    if (shouldNotifyReset) {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Orientation changed. Existing crop selections were reset.", centerPosition);
    }
  }, [baseRotation, cropStates, currentVariantIndex, showToast, straightenAngle]);

  const handleRotate = (direction: "left" | "right") => {
    const delta = direction === "left" ? -90 : 90;
    applyOrientation(baseRotation + delta, straightenAngle);
  };

  const handleStraightenChange = (nextAngle: number) => {
    applyOrientation(baseRotation, nextAngle);
  };

  // Fill every variant with a centered crop so the operator can confirm in one
  // step. Each area is the largest centered rect of the variant's aspect ratio,
  // computed in the rotated image's coordinate space to match manual crops.
  const applyAutoCrop = useCallback(async () => {
    if (!previewUrl || isProcessing || isAutoCropping) {
      return;
    }

    setIsAutoCropping(true);

    try {
      const { width, height } = await loadImageSize(previewUrl);
      const box = rotatedBoundingBox(width, height, normalizeDegrees(rotation));

      setCropStates((prev) => {
        const next = { ...prev };
        for (const type of variantSequence) {
          next[type] = {
            ...prev[type],
            crop: { x: 0, y: 0 },
            zoom: 1,
            croppedAreaPixels: centeredCropArea(box.width, box.height, VARIANT_SPECS[type].ratio),
            completed: true,
          };
        }
        return next;
      });
    } catch (error) {
      console.error("Auto-crop failed:", error);
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Could not auto-crop this image", centerPosition);
    } finally {
      setIsAutoCropping(false);
    }
  }, [previewUrl, isProcessing, isAutoCropping, rotation, showToast]);

  const saveCurrentCrop = () => {
    if (!currentState.croppedAreaPixels) {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Please adjust the crop area before continuing", centerPosition);
      return false;
    }

    updateVariantState(currentVariantType, { completed: true });
    return true;
  };

  // Navigate to previous variant
  const handlePrevious = () => {
    if (currentVariantIndex > 0 && saveCurrentCrop()) {
      setCurrentVariantIndex((prev) => prev - 1);
    }
  };

  // Navigate to next variant
  const handleNext = () => {
    if (currentVariantIndex < variantSequence.length - 1 && saveCurrentCrop()) {
      setCurrentVariantIndex((prev) => prev + 1);
    }
  };

  // Jump to specific variant
  const jumpToVariant = (index: number) => {
    if (index === currentVariantIndex) {
      return;
    }

    if (saveCurrentCrop()) {
      setCurrentVariantIndex(index);
    }
  };

  // Check if all crops have been defined
  const allCropsComplete = () => {
    return variantSequence.every(type => cropStates[type].croppedAreaPixels !== null);
  };

  // Process all crops and return variant files
  const handleConfirmAll = async () => {
    if (!saveCurrentCrop()) {
      return;
    }

    if (!allCropsComplete()) {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(`Please complete all ${totalVariants} variant crops`, centerPosition);
      return;
    }

    setIsProcessing(true);

    try {
      const normalizedRotation = normalizeDegrees(rotation);
      const [sourceFile, variantFiles] = await Promise.all([
        normalizedRotation === 0
          ? Promise.resolve(file)
          : createRotatedSourceImage(previewUrl, file.name, normalizedRotation),
        createMultiVariantImages(previewUrl, cropStates, file.name, normalizedRotation),
      ]);

      onConfirm(
        sourceFile,
        variantFiles,
        showCreditField ? photographerCredit.trim() : undefined
      );
    } catch (error) {
      console.error("Error processing variants:", error);
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Failed to process image variants", centerPosition);
    } finally {
      setIsProcessing(false);
    }
  };

  const completedCount = variantSequence.filter(type => cropStates[type].completed).length;
  const isLastVariant = currentVariantIndex === variantSequence.length - 1;

  const handlePrimaryAction = async () => {
    if (isLastVariant) {
      await handleConfirmAll();
      return;
    }

    handleNext();
  };

  return {
    previewUrl,
    currentVariantIndex,
    currentVariantType,
    currentState,
    currentSpec,
    cropStates,
    totalVariants,
    completedCount,
    isLastVariant,
    fileIdentity,
    isProcessing,
    isAutoCropping,
    baseRotation,
    straightenAngle,
    rotation,
    showCreditField,
    photographerCredit,
    setPhotographerCredit,
    onCropChange,
    onZoomChange,
    onCropAreaChange,
    applyOrientation,
    handleRotate,
    handleStraightenChange,
    applyAutoCrop,
    handlePrevious,
    jumpToVariant,
    handlePrimaryAction,
  };
}
