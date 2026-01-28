import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { ChevronLeft, ChevronRight, X, ExternalLink, Code } from "lucide-react";
import type { ImageMetadata } from "@client/shared/services/api/types";

interface ImageLightboxProps {
  images: string[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  photographerCredit?: string;
  imageMetadata?: ImageMetadata[];
  instagramUrl?: string;
  embedCode?: string;
  onCopySuccess?: (message: string, position?: { x: number; y: number }) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageLightbox({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNext,
  onPrevious,
  photographerCredit,
  imageMetadata,
  instagramUrl,
  embedCode,
  onCopySuccess,
}: ImageLightboxProps) {
  const currentImage = images[currentIndex];
  const imageUrl = `/api/images/${currentImage.replace(/^data\/images\//, '')}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 bg-black/95 border-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Image Viewer</DialogTitle>
          <DialogDescription>
            View images with navigation controls and metadata information
          </DialogDescription>
        </DialogHeader>
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10 text-white hover:bg-white/20"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Navigation buttons */}
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
              onClick={onPrevious}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
              onClick={onNext}
              disabled={currentIndex === images.length - 1}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        {/* Image */}
        <div className="relative">
          <img
            src={imageUrl}
            alt="Full size"
            className="w-full h-auto max-h-[90vh] object-contain"
          />

          {/* Image counter, metadata, and credit */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-4">
            <div className="max-w-4xl mx-auto">
              {/* Image counter */}
              <p className="text-sm text-white text-center mb-2">
                {currentIndex + 1} / {images.length}
              </p>

              {/* Metadata row */}
              {imageMetadata && currentIndex < imageMetadata.length && imageMetadata[currentIndex] && (
                <div className="flex items-center justify-center gap-4 text-xs text-gray-300 mb-2">
                  <span>
                    {imageMetadata[currentIndex].width} × {imageMetadata[currentIndex].height}px
                  </span>
                  <span>•</span>
                  <span>
                    {formatFileSize(imageMetadata[currentIndex].size)}
                  </span>
                  <span>•</span>
                  <span className="uppercase">
                    {imageMetadata[currentIndex].format}
                  </span>
                </div>
              )}

              {/* Photographer credit */}
              {photographerCredit && (
                <p className="text-xs text-gray-300 text-center">
                  Photo by {photographerCredit}
                </p>
              )}

              {/* Instagram buttons */}
              {(instagramUrl || embedCode) && (
                <div className="flex gap-2 justify-center mt-3">
                  {instagramUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs"
                      onClick={async (e) => {
                        try {
                          await navigator.clipboard.writeText(instagramUrl);
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          const position = {
                            x: rect.left + rect.width / 2,
                            y: rect.bottom + 8
                          };
                          onCopySuccess?.("Instagram URL copied to clipboard", position);
                        } catch (error) {
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          const position = {
                            x: rect.left + rect.width / 2,
                            y: rect.bottom + 8
                          };
                          onCopySuccess?.("Failed to copy URL", position);
                        }
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Copy URL
                    </Button>
                  )}
                  {embedCode && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs"
                      onClick={async (e) => {
                        try {
                          await navigator.clipboard.writeText(embedCode);
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          const position = {
                            x: rect.left + rect.width / 2,
                            y: rect.bottom + 8
                          };
                          onCopySuccess?.("Embed code copied to clipboard", position);
                        } catch (error) {
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          const position = {
                            x: rect.left + rect.width / 2,
                            y: rect.bottom + 8
                          };
                          onCopySuccess?.("Failed to copy embed code", position);
                        }
                      }}
                    >
                      <Code className="h-3 w-3 mr-1" />
                      Copy Embed
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
