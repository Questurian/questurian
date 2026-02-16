import { useState } from "react";
import type { LocationResponse, Upload, ImageMetadata, InstagramEmbed } from "@client/shared/services/api/types";
import type { ImageVariant } from "@questurian/lm-shared";
import { Button } from "@client/components/ui";
import { X } from "lucide-react";
import { useToast } from "@client/shared/hooks/useToast";
import { useDeleteUpload } from "@client/shared/services/api/hooks/useDeleteUpload";
import { useDeleteInstagramEmbed } from "@client/shared/services/api/hooks/useDeleteInstagramEmbed";
import { AddInstagramEmbedForm } from "../forms/AddInstagramEmbedForm";
import { AddUploadFilesForm } from "../forms/AddUploadFilesForm";
import { ImageLightbox } from "../ui/ImageLightbox";

interface LocationMediaGalleryProps {
  locationDetail: LocationResponse;
}

export function LocationMediaGallery({ locationDetail }: LocationMediaGalleryProps) {
  const { showToast } = useToast();

  const [lightboxState, setLightboxState] = useState({
    isOpen: false,
    images: [] as string[],
    currentIndex: 0,
    photographerCredit: undefined as string | undefined,
    imageMetadata: undefined as ImageMetadata[] | undefined,
    instagramUrl: undefined as string | undefined,
    embedCode: undefined as string | undefined,
  });

  const deleteMutation = useDeleteUpload({
    locationId: locationDetail.id,
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Upload deleted successfully", centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to delete upload", centerPosition);
    },
  });

  const deleteInstagramMutation = useDeleteInstagramEmbed({
    locationId: locationDetail.id,
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Instagram embed deleted successfully", centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to delete Instagram embed", centerPosition);
    },
  });

  function handleImageSetClick(upload: Upload) {
    if ('imageSet' in upload && upload.imageSet) {
      const imageSet = upload.imageSet;
      if (imageSet && imageSet.variants) {
        const variantPaths = imageSet.variants.map((v: ImageVariant) => v.path);
        const squareVariantIndex = imageSet.variants.findIndex(v => v.type === 'square');
        const startIndex = squareVariantIndex >= 0 ? squareVariantIndex : 0;

        setLightboxState({
          isOpen: true,
          images: variantPaths,
          currentIndex: startIndex,
          photographerCredit: imageSet.photographerCredit || undefined,
          imageMetadata: imageSet.variants.map(variant => ({
            width: variant.dimensions.width,
            height: variant.dimensions.height,
            size: variant.size,
            format: variant.format,
          })),
          instagramUrl: undefined,
          embedCode: undefined,
        });
      }
    }
  }

  function handleInstagramImageClick(embed: InstagramEmbed, imageIndex: number) {
    setLightboxState({
      isOpen: true,
      images: embed.images || [],
      currentIndex: imageIndex,
      photographerCredit: embed.username ? `@${embed.username}` : undefined,
      imageMetadata: undefined,
      instagramUrl: embed.url,
      embedCode: embed.embed_code,
    });
  }

  function handleLightboxNext() {
    setLightboxState((prev) => ({
      ...prev,
      currentIndex: Math.min(prev.currentIndex + 1, prev.images.length - 1),
    }));
  }

  function handleLightboxPrevious() {
    setLightboxState((prev) => ({
      ...prev,
      currentIndex: Math.max(prev.currentIndex - 1, 0),
    }));
  }

  function handleDeleteUpload(uploadId: number) {
    if (confirm("Are you sure you want to delete this upload?")) {
      deleteMutation.mutate(uploadId);
    }
  }

  function handleDeleteInstagramEmbed(embedId: number) {
    if (confirm("Are you sure you want to delete this Instagram embed?")) {
      deleteInstagramMutation.mutate(embedId);
    }
  }

  return (
    <>
      {/* Existing Uploads Gallery */}
      {locationDetail.uploads && locationDetail.uploads.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Uploaded Images:
          </span>
          <ul className="flex gap-2 ml-4 flex-wrap">
            {locationDetail.uploads.map((upload) => {
              if (upload.imageSet) {
                const imageSet = upload.imageSet;
                const squareVariant = imageSet.variants?.find(v => v.type === 'square');
                if (!squareVariant) return null;

                const imageUrl = `/api/images/${squareVariant.path.replace(/^data\/images\//, '')}`;
                return (
                  <li key={`${upload.id}-imageset`} className="relative group">
                    <div className="shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-muted hover:ring-2 ring-primary transition-all">
                      <img
                        src={imageUrl}
                        alt={imageSet.altText || imageSet.photographerCredit || "Uploaded image"}
                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        loading="lazy"
                        onClick={() => handleImageSetClick(upload)}
                        title={imageSet.photographerCredit || "Click to view all variants"}
                      />
                      </div>
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                        {imageSet.variants?.length || 0} variants
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteUpload(upload.id!)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  );
              }

              return null;
            })}
          </ul>
        </div>
      )}

      {/* Existing Instagram Embeds */}
      {locationDetail.instagram_embeds && locationDetail.instagram_embeds.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Instagram Posts:
          </span>
          <ul className="flex gap-2 ml-4 flex-wrap">
            {locationDetail.instagram_embeds.map((embed) => {
              const firstImage = embed.images?.[0];
              const imageUrl = firstImage
                ? `/api/images/${firstImage.replace(/^data\/images\//, '')}`
                : null;

              return (
                <li key={embed.id} className="relative group">
                  {imageUrl && (
                    <div className="shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-muted hover:ring-2 ring-primary transition-all">
                      <img
                        src={imageUrl}
                        alt="Instagram"
                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        loading="lazy"
                        onClick={() => handleInstagramImageClick(embed, 0)}
                        title={embed.username ? `@${embed.username}` : "Click to view"}
                      />
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDeleteInstagramEmbed(embed.id!)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Instagram and Upload Forms */}
      <div className="flex gap-4">
        <div className="flex-1">
          <AddInstagramEmbedForm locationId={locationDetail.id} />
        </div>
        <div className="flex-1">
          <AddUploadFilesForm locationId={locationDetail.id} />
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxState.isOpen && (
        <ImageLightbox
          images={lightboxState.images}
          currentIndex={lightboxState.currentIndex}
          isOpen={lightboxState.isOpen}
          onClose={() => setLightboxState({ ...lightboxState, isOpen: false })}
          onNext={handleLightboxNext}
          onPrevious={handleLightboxPrevious}
          photographerCredit={lightboxState.photographerCredit}
          imageMetadata={lightboxState.imageMetadata}
          instagramUrl={lightboxState.instagramUrl}
          embedCode={lightboxState.embedCode}
          onCopySuccess={(message, position) => {
            showToast(message, position || { x: window.innerWidth / 2, y: window.innerHeight / 2 });
          }}
        />
      )}
    </>
  );
}
