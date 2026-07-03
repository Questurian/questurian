import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { PickPhotosPhase } from "@client/features/location-create/components/PickPhotosPhase";
import type { PhotoImportStartPhoto } from "@questurian/lm-shared";

type PhotoImportPickerDialogProps = {
  open: boolean;
  locationId: number;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (photos: PhotoImportStartPhoto[]) => void;
};

export function PhotoImportPickerDialog({
  open,
  locationId,
  busy,
  onOpenChange,
  onConfirm,
}: PhotoImportPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onOpenChange(false)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Pull photos from Google</DialogTitle>
        </DialogHeader>
        <PickPhotosPhase
          locationId={locationId}
          onConfirm={onConfirm}
          onSkip={() => onOpenChange(false)}
          continueLabel="Start import"
          busy={busy}
        />
      </DialogContent>
    </Dialog>
  );
}
