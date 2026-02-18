import { X, Crop, Check } from "lucide-react";
import { Button } from "@client/components/ui/button";

interface ImagePreviewGridProps {
  files: File[];
  onRemove: (index: number) => void;
  onCrop?: (index: number) => void;
  croppedIndicators?: boolean[];
}

export function ImagePreviewGrid({ files, onRemove, onCrop, croppedIndicators }: ImagePreviewGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {files.map((file, index) => {
        const previewUrl = URL.createObjectURL(file);
        const isCropped = croppedIndicators?.[index] || false;

        return (
          <div key={index} className="relative group">
            <img
              src={previewUrl}
              alt={file.name}
              className="w-full h-33 object-cover rounded"
              onLoad={() => URL.revokeObjectURL(previewUrl)}
            />

            {/* Action buttons */}
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onCrop && (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-6 w-6"
                  onClick={() => onCrop(index)}
                  title={isCropped ? "Re-crop image" : "Crop image"}
                >
                  <Crop className="h-3 w-3" />
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="h-6 w-6"
                onClick={() => onRemove(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            {/* Cropped indicator badge */}
            {isCropped && (
              <div className="absolute bottom-1 left-1 bg-green-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                <Check className="h-3 w-3" />
                <span>Cropped</span>
              </div>
            )}

            <p className="text-xs truncate mt-1">{file.name}</p>
          </div>
        );
      })}
    </div>
  );
}
