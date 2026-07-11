import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { Loader2, ScanText, Trash2 } from "lucide-react";

interface ImagePreviewModalProps {
  isOpen: boolean;
  imageUrl: string;
  altText?: string;
  photographerCredit?: string;
  origin?: string;
  reviewLoading?: boolean;
  onClose: () => void;
  onReview: () => void;
  onDelete: () => void;
}

/**
 * Read-only, full-size look at a staged source image. Unlike the Review flow,
 * opening this modal does NOT call the alt-text AI — it just fetches the image
 * that's already on disk so the user can decide whether to Review or Remove it.
 */
export function ImagePreviewModal({
  isOpen,
  imageUrl,
  altText,
  photographerCredit,
  origin,
  reviewLoading = false,
  onClose,
  onReview,
  onDelete,
}: ImagePreviewModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-center rounded-md bg-muted/40">
          <img
            src={imageUrl}
            alt={altText ?? "Imported photo"}
            className="max-h-[70vh] w-auto max-w-full object-contain"
          />
        </div>

        {(photographerCredit || origin) && (
          <p className="text-xs text-muted-foreground">
            {photographerCredit}
            {photographerCredit && origin ? " · " : ""}
            {origin}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onDelete}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
          <Button
            type="button"
            onClick={onReview}
            disabled={reviewLoading}
            className="gap-1.5"
          >
            {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
            Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
