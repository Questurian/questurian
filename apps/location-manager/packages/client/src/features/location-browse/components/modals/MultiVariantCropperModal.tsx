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
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { type ImageVariantType, VARIANT_SPECS } from "@questurian/lm-shared";
import { useToast } from "@client/shared/hooks/useToast";
import { createMultiVariantImages, type CropState } from "../../utils/image-processing";

interface MultiVariantCropperModalProps {
  file: File;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (sourceFile: File, variantFiles: { type: ImageVariantType; file: File }[]) => void;
}

const variantSequence: ImageVariantType[] = ['thumbnail', 'square', 'wide', 'social', 'editorial', 'portrait', 'hero'];

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
  const [cropStates, setCropStates] = useState<Record<ImageVariantType, CropState>>({
    thumbnail: { variantType: 'thumbnail', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    square: { variantType: 'square', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    wide: { variantType: 'wide', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    social: { variantType: 'social', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    editorial: { variantType: 'editorial', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    portrait: { variantType: 'portrait', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    hero: { variantType: 'hero', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
  });

  const currentVariantType = variantSequence[currentVariantIndex];
  const currentState = cropStates[currentVariantType];
  const currentSpec = VARIANT_SPECS[currentVariantType];
  const totalVariants = variantSequence.length;

  // Create preview URL when file changes
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  // Update crop position for current variant
  const onCropChange = useCallback((crop: Point) => {
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: { ...prev[currentVariantType], crop }
    }));
  }, [currentVariantType]);

  // Update zoom for current variant
  const onZoomChange = useCallback((zoom: number) => {
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: { ...prev[currentVariantType], zoom }
    }));
  }, [currentVariantType]);

  // Update cropped area pixels for current variant
  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: { ...prev[currentVariantType], croppedAreaPixels, completed: true }
    }));
  }, [currentVariantType]);

  // Navigate to previous variant
  const handlePrevious = () => {
    if (currentVariantIndex > 0) {
      // Mark current as completed before moving
      setCropStates(prev => ({
        ...prev,
        [currentVariantType]: { ...prev[currentVariantType], completed: true }
      }));
      setCurrentVariantIndex(currentVariantIndex - 1);
    }
  };

  // Navigate to next variant
  const handleNext = () => {
    if (currentVariantIndex < variantSequence.length - 1) {
      // Mark current as completed before moving
      setCropStates(prev => ({
        ...prev,
        [currentVariantType]: { ...prev[currentVariantType], completed: true }
      }));
      setCurrentVariantIndex(currentVariantIndex + 1);
    }
  };

  // Jump to specific variant
  const jumpToVariant = (index: number) => {
    // Mark current as completed before jumping
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: { ...prev[currentVariantType], completed: true }
    }));
    setCurrentVariantIndex(index);
  };

  // Check if all crops have been defined
  const allCropsComplete = () => {
    return variantSequence.every(type => cropStates[type].croppedAreaPixels !== null);
  };

  // Process all crops and return variant files
  const handleConfirmAll = async () => {
    // Ensure current crop is saved
    if (!currentState.croppedAreaPixels) {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Please adjust the crop area before confirming", centerPosition);
      return;
    }

    // Mark current as completed
    setCropStates(prev => ({
      ...prev,
      [currentVariantType]: { ...prev[currentVariantType], completed: true }
    }));

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-full h-[90vh] md:h-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>
            Crop Image: {currentSpec.label} - {currentVariantType.charAt(0).toUpperCase() + currentVariantType.slice(1)}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Step {currentVariantIndex + 1} of {totalVariants} • Target: {currentSpec.width}×{currentSpec.height}px
          </p>
        </DialogHeader>

        {/* Cropper area */}
        <div className="relative h-[50vh] md:h-[500px] bg-black">
          {previewUrl && (
            <Cropper
              image={previewUrl}
              crop={currentState.crop}
              zoom={currentState.zoom}
              aspect={currentSpec.ratio}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropComplete}
              restrictPosition={true}
              cropShape="rect"
              showGrid={true}
            />
          )}
        </div>

        {/* Variant progress badges */}
        <div className="px-6 py-3 border-t border-b bg-muted/30">
          <div className="flex gap-2 flex-wrap">
            {variantSequence.map((type, idx) => {
              const isActive = idx === currentVariantIndex;
              const isCompleted = cropStates[type].completed || cropStates[type].croppedAreaPixels !== null;
              const spec = VARIANT_SPECS[type];

              return (
                <button
                  key={type}
                  onClick={() => jumpToVariant(idx)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
                    ${isActive
                      ? 'bg-blue-600 text-white'
                      : isCompleted
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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

        {/* Zoom info */}
        <div className="px-6 py-2 text-xs text-muted-foreground">
          Zoom: {Math.round(currentState.zoom * 100)}% • Use scroll wheel or pinch to adjust
        </div>

        <DialogFooter className="p-6 pt-0 gap-2">
          <div className="flex items-center gap-2 mr-auto">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={currentVariantIndex === variantSequence.length - 1 || isProcessing}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isProcessing}
            size="sm"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleConfirmAll}
            disabled={isProcessing || !allCropsComplete()}
            size="sm"
          >
            {isProcessing
              ? "Processing..."
              : allCropsComplete()
                ? `Confirm All (${completedCount}/${totalVariants})`
                : `Crop All (${completedCount}/${totalVariants})`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
