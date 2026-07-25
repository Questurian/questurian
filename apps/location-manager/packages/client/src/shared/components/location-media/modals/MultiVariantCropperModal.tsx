import Cropper from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { Check, ChevronLeft, RotateCcw, RotateCw, Sparkles } from "lucide-react";
import { VARIANT_SPECS } from "@questurian/lm-shared";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import { StraightenDial } from "./StraightenDial";
import { useMultiVariantCropper } from "./useMultiVariantCropper";
import {
  STRAIGHTEN_MAX,
  STRAIGHTEN_MIN,
  STRAIGHTEN_STEP,
  formatDegrees,
  variantSequence,
} from "./multiVariantCropper.geometry";

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

export function MultiVariantCropperModal({
  file,
  isOpen,
  onClose,
  onConfirm,
  initialPhotographerCredit,
}: MultiVariantCropperModalProps) {
  const {
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
  } = useMultiVariantCropper({ file, onConfirm, initialPhotographerCredit });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-w-4xl w-full h-[90dvh] md:h-auto md:max-h-[90vh] flex-col p-0">
        <DialogHeader className="shrink-0 p-4 pb-0 sm:p-6 sm:pb-0">
          <DialogTitle>Review Image Crop</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Step {currentVariantIndex + 1} of {totalVariants} • {currentSpec.label} • Target: {currentSpec.width}×{currentSpec.height}px
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pt-4 sm:p-6">
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Crop Progress</span>
                <span className="tabular-nums">{completedCount}/{totalVariants} complete</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={() => void applyAutoCrop()}
                disabled={isAutoCropping || isProcessing}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isAutoCropping ? "Auto-cropping…" : "Auto-crop all"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
              {variantSequence.map((type, idx) => {
                const isActive = idx === currentVariantIndex;
                const isCompleted = cropStates[type].completed || cropStates[type].croppedAreaPixels !== null;
                const spec = VARIANT_SPECS[type];

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => jumpToVariant(idx)}
                    aria-pressed={isActive}
                    title={`${type} (${spec.label})`}
                    className={`
                    flex min-w-0 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors
                    ${isActive
                      ? 'bg-blue-600 text-white'
                      : isCompleted
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }
                  `}
                  >
                    <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                      {isCompleted && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate capitalize">{type}</span>
                    <span className="shrink-0 text-[10px] opacity-70">{spec.label}</span>
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

        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-border p-4 sm:p-6">
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
