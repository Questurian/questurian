import Cropper from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { useImageCropper } from "../../hooks/useImageCropper";
import { useToast } from "@client/shared/hooks/useToast";

interface ImageCropperModalProps {
  file: File;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (croppedFile: File) => void;
}

export function ImageCropperModal({
  file,
  isOpen,
  onClose,
  onConfirm,
}: ImageCropperModalProps) {
  const { showToast } = useToast();
  const {
    crop,
    setCrop,
    zoom,
    setZoom,
    aspectRatio,
    onCropComplete,
    processCrop,
    isProcessing,
    error,
    previewUrl,
  } = useImageCropper({ file });

  async function handleConfirm() {
    const croppedFile = await processCrop();

    if (croppedFile) {
      onConfirm(croppedFile);
    } else {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error || "Failed to crop image", centerPosition);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full h-[90vh] md:h-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Crop Image (16:9 Landscape)</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Drag to reposition, scroll or pinch to zoom. Final size: 1920×1080px
          </p>
        </DialogHeader>

        {/* Cropper area */}
        <div className="relative h-[60vh] md:h-[500px] bg-black">
          {previewUrl && (
            <Cropper
              image={previewUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspectRatio}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              restrictPosition={true}
              cropShape="rect"
              showGrid={true}
            />
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="px-6 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Zoom info */}
        <div className="px-6 py-2 text-xs text-muted-foreground">
          Zoom: {Math.round(zoom * 100)}% • Use scroll wheel or pinch to adjust
        </div>

        <DialogFooter className="p-6 pt-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? "Processing..." : "Confirm Crop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
