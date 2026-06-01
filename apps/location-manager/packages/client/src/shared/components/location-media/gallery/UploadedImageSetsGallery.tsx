import { X } from "lucide-react";
import type { Upload } from "@client/shared/services/api/types";
import { Button } from "@client/components/ui";
import {
  getMissingVariantCount,
  hasMissingPhotographerCredit,
  toImageApiPath,
} from "./location-media-gallery.utils";

interface UploadedImageSetsGalleryProps {
  uploads: Upload[];
  loadingSourceUploadId: number | null;
  onOpen: (upload: Upload) => void;
  onDelete: (uploadId: number) => void;
}

export function UploadedImageSetsGallery({
  uploads,
  loadingSourceUploadId,
  onOpen,
  onDelete,
}: UploadedImageSetsGalleryProps) {
  return (
    <>
      {uploads.map((upload) => {
        const imageSet = upload.imageSet;
        if (!imageSet) return null;
        const preview = imageSet.variants?.find((variant) => variant.type === "square") || imageSet.variants?.[0];
        if (!preview?.path) return null;
        const missingCredit = hasMissingPhotographerCredit(imageSet.photographerCredit);
        const missingVariantCount = getMissingVariantCount(upload);
        const loadingSource = loadingSourceUploadId === upload.id;
        return (
          <li key={`${upload.id}-imageset`} className="relative group">
            <div className={`shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-muted transition-all ${
              missingCredit || missingVariantCount > 0 ? "ring-2 ring-amber-500/70" : "hover:ring-2 ring-primary"
            }`}>
              <img
                src={`${toImageApiPath(preview.path)}?v=${upload.id ?? "upload"}`}
                alt={imageSet.altText || imageSet.photographerCredit || "Uploaded image"}
                className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                loading="lazy"
                onClick={() => onOpen(upload)}
                title={missingVariantCount > 0 ? "Missing variants. Click to open manual crop UI." : (imageSet.photographerCredit || "Click to view all variants")}
              />
            </div>
            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
              {imageSet.variants?.length || 0} variants
            </div>
            {missingVariantCount > 0 && <div className="absolute top-1 left-1 bg-amber-700/90 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">{missingVariantCount} missing</div>}
            {loadingSource && <div className="absolute top-6 left-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">Loading source...</div>}
            {missingCredit && (
              <div className={`absolute left-1 bg-amber-600/90 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none ${
                missingVariantCount > 0 || loadingSource ? "top-10" : "top-1"
              }`}>Missing Credit</div>
            )}
            <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onDelete(upload.id!)}>
              <X className="h-3 w-3" />
            </Button>
          </li>
        );
      })}
    </>
  );
}
