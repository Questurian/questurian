import { useState, useCallback, useEffect } from "react";
import Cropper, { type Point, type Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { Check, ChevronLeft } from "lucide-react";
import { type ImageVariantType, VARIANT_SPECS } from "@questurian/lm-shared";
import { useToast } from "@client/shared/hooks/useToast";
import { createMultiVariantImages } from "@client/shared/lib/image-processing";
import type { CropState } from "@client/shared/types/location-media.types";

interface MultiVariantCropperModalProps {
  file: File;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (sourceFile: File, variantFiles: { type: ImageVariantType; file: File }[]) => void;
}

const variantSequence: ImageVariantType[] = ['thumbnail', 'square', 'wide', 'social', 'editorial', 'portrait', 'hero'];

function createInitialCropStates(): Record<ImageVariantType, CropState> {
  return {
    thumbnail: { variantType: 'thumbnail', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    square: { variantType: 'square', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    wide: { variantType: 'wide', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    social: { variantType: 'social', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    editorial: { variantType: 'editorial', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    portrait: { variantType: 'portrait', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    hero: { variantType: 'hero', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
  };
}

export function MultiVariantCropperModal({
  file,
  isOpen,
  onClose,
  onConfirm,
}: MultiVariantCropperModalProps) {
  const { showToast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize crop states for all variants
  const [cropStates, setCropStates] = useState<Record<ImageVariantType, CropState>>(() => createInitialCropStates());

  const currentVariantType = variantSequence[currentVariantIndex];
  const currentState = cropStates[currentVariantType];
  const currentSpec = VARIANT_SPECS[currentVariantType];
  const totalVariants = variantSequence.length;
  const fileIdentity = `${file.name}:${file.lastModified}:${file.size}`;

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
      // Generate all variant files
      const variantFiles = await createMultiVariantImages(
        previewUrl,
        cropStates,
        file.name
      );

      // Return source file + variants
      onConfirm(file, variantFiles);
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full h-[90vh] md:h-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Review Image Crop</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Step {currentVariantIndex + 1} of {totalVariants} • {currentSpec.label} • Target: {currentSpec.width}×{currentSpec.height}px
          </p>
        </DialogHeader>

        <div className="space-y-4 p-6 pt-4">
          {/* Cropper area */}
          <div className="overflow-hidden rounded-xl border border-border bg-black">
            <div className="relative h-[48vh] md:h-[460px]">
              {previewUrl && (
                <Cropper
                  key={`${fileIdentity}:${currentVariantType}`}
                  image={previewUrl}
                  crop={currentState.crop}
                  zoom={currentState.zoom}
                  aspect={currentSpec.ratio}
                  onCropChange={onCropChange}
                  onZoomChange={onZoomChange}
                  onCropComplete={onCropAreaChange}
                  onCropAreaChange={onCropAreaChange}
                  restrictPosition={true}
                  cropShape="rect"
                  showGrid={true}
                />
              )}
            </div>
          </div>

          {/* Variant progress badges */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Crop Progress</span>
              <span>{completedCount}/{totalVariants} complete</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {variantSequence.map((type, idx) => {
                const isActive = idx === currentVariantIndex;
                const isCompleted = cropStates[type].completed || cropStates[type].croppedAreaPixels !== null;
                const spec = VARIANT_SPECS[type];

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => jumpToVariant(idx)}
                    className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
                    ${isActive
                      ? 'bg-blue-600 text-white'
                      : isCompleted
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }
                  `}
                  >
                    {isCompleted && <Check className="h-3 w-3" />}
                    <span className="capitalize">{type}</span>
                    <span className="text-[10px] opacity-70">({spec.label})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Zoom: {Math.round(currentState.zoom * 100)}%</span>
            <span>Use scroll wheel or pinch to adjust</span>
          </div>

          <div className="rounded-lg bg-blue-500/10 p-3">
            <h4 className="mb-1 text-sm font-medium text-blue-300">
              Crop Tips
            </h4>
            <ul className="space-y-1 text-xs text-blue-400">
              <li>• Keep the main subject centered inside the target frame</li>
              <li>• Use Previous or the progress pills to adjust an earlier crop</li>
              <li>• The primary button advances one crop at a time until final confirmation</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2 p-6 pt-0">
          <div className="mr-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrevious}
              disabled={currentVariantIndex === 0 || isProcessing}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isProcessing}
            size="sm"
          >
            Cancel Upload
          </Button>
          <Button
            type="button"
            onClick={() => void handlePrimaryAction()}
            disabled={isProcessing || !currentState.croppedAreaPixels}
            size="sm"
          >
            {isProcessing
              ? "Processing..."
              : isLastVariant
                ? `Confirm Crops (${completedCount}/${totalVariants})`
                : `Use Crop & Continue (${currentVariantIndex + 1}/${totalVariants})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
