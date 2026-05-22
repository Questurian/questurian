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
import { Check, ChevronLeft, RotateCcw, RotateCw } from "lucide-react";
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

interface MultiVariantCropperModalProps {
  file: File;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    sourceFile: File,
    variantFiles: ImageVariantUploadFile[],
    photographerCredit?: string
  ) => void;
  /**
   * Optional photographer credit. When provided, the modal renders an editable
   * input pre-filled with this string and passes the final value back through
   * onConfirm. Used by the Add-flow Photo Import path (ADR-0007) where the
   * Google `authorAttributions[0].displayName` is editable before finalizing.
   * Omit on operator-uploaded photos that have no credit semantics yet.
   */
  initialPhotographerCredit?: string;
}

const variantSequence: ImageVariantType[] = ['thumbnail', 'square', 'wide', 'open_graph', 'editorial', 'portrait', 'hero'];
const STRAIGHTEN_MIN = -20;
const STRAIGHTEN_MAX = 20;
const STRAIGHTEN_STEP = 0.1;

function clampStraightenAngle(angle: number): number {
  return Math.min(STRAIGHTEN_MAX, Math.max(STRAIGHTEN_MIN, Number(angle.toFixed(1))));
}

function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function formatDegrees(angle: number): string {
  if (Math.abs(angle) < 0.05) {
    return "0°";
  }

  return `${angle > 0 ? "+" : ""}${angle.toFixed(1)}°`;
}

interface StraightenDialProps {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function StraightenDial({
  value,
  min,
  max,
  step,
  disabled = false,
  onChange,
}: StraightenDialProps) {
  const tickValues = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const progress = ((value - min) / (max - min)) * 100;
  const activeLeft = value >= 0 ? 50 : progress;
  const activeWidth = Math.abs(progress - 50);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3 text-xs">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Straighten</p>
          <p className="text-muted-foreground">Fine tune the horizon with small angle adjustments.</p>
        </div>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 font-semibold text-foreground tabular-nums">
          {formatDegrees(value)}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-background/80 px-3 py-4">
        <div className="relative h-16">
          <div className="pointer-events-none absolute inset-x-3 top-1/2 h-1 -translate-y-1/2">
            <div className="absolute inset-0 rounded-full bg-border/70" />
            <div
              className="absolute top-0 h-full rounded-full bg-blue-500/80"
              style={{
                left: `${activeLeft}%`,
                width: `${activeWidth}%`,
              }}
            />
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/70" />

          <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
            {tickValues.map((tickValue) => {
              const isCenter = tickValue === 0;
              const isMajor = tickValue % 5 === 0;

              return (
                <span
                  key={tickValue}
                  className={`block w-px rounded-full ${
                    isCenter
                      ? "h-7 bg-foreground/80"
                      : isMajor
                        ? "h-5 bg-foreground/45"
                        : "h-3 bg-foreground/20"
                  }`}
                />
              );
            })}
          </div>

          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            disabled={disabled}
            aria-label="Straighten image"
            className="absolute inset-0 z-10 h-full w-full cursor-ew-resize appearance-none bg-transparent focus:outline-none disabled:cursor-not-allowed [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-0 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-[0_0_0_5px_rgba(59,130,246,0.2)] [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:shadow-[0_0_0_5px_rgba(59,130,246,0.2)] [&::-moz-range-track]:bg-transparent"
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{min}°</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-foreground/80">Level</span>
          <span>{max}°</span>
        </div>
      </div>
    </div>
  );
}

function createInitialCropStates(): Record<ImageVariantType, CropState> {
  return {
    thumbnail: { variantType: 'thumbnail', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    square: { variantType: 'square', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    wide: { variantType: 'wide', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    open_graph: { variantType: 'open_graph', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
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
  initialPhotographerCredit,
}: MultiVariantCropperModalProps) {
  const { showToast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
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
                  key={`${fileIdentity}:${currentVariantType}:${baseRotation}`}
                  image={previewUrl}
                  crop={currentState.crop}
                  zoom={currentState.zoom}
                  rotation={rotation}
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

          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Orientation</p>
                  <p className="text-xs text-muted-foreground">
                    Use the 90° buttons for sideways photos, then straighten like the iPhone photo editor.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRotate("left")}
                    disabled={isProcessing}
                  >
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    Rotate Left
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRotate("right")}
                    disabled={isProcessing}
                  >
                    <RotateCw className="mr-1.5 h-4 w-4" />
                    Rotate Right
                  </Button>
                  {(baseRotation !== 0 || straightenAngle !== 0) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => applyOrientation(0, 0)}
                      disabled={isProcessing}
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px] lg:items-end">
                <StraightenDial
                  value={straightenAngle}
                  min={STRAIGHTEN_MIN}
                  max={STRAIGHTEN_MAX}
                  step={STRAIGHTEN_STEP}
                  onChange={handleStraightenChange}
                  disabled={isProcessing}
                />

                <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-background/80 px-4 py-3 text-sm">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Straighten</p>
                    <p className="font-semibold tabular-nums text-foreground">{formatDegrees(straightenAngle)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total rotation</p>
                    <p className="font-semibold tabular-nums text-foreground">{formatDegrees(rotation)}</p>
                  </div>
                </div>
              </div>
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

          {showCreditField && (
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <label
                htmlFor="photographer-credit"
                className="mb-1 block text-xs font-medium text-foreground"
              >
                Photographer credit
              </label>
              <input
                id="photographer-credit"
                type="text"
                value={photographerCredit}
                onChange={(e) => setPhotographerCredit(e.target.value)}
                placeholder="Google"
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Prefilled from Google's <code>authorAttributions</code>. Edit if you want a different attribution string on this image-set.
              </p>
            </div>
          )}

          <div className="rounded-lg bg-blue-500/10 p-3">
            <h4 className="mb-1 text-sm font-medium text-blue-300">
              Crop Tips
            </h4>
            <ul className="space-y-1 text-xs text-blue-400">
              <li>• Rotate first if the source image is sideways or upside down, then use the dial to straighten it</li>
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
