import { useMemo, useState } from "react";
import type { LocationResponse, Upload, ImageMetadata, InstagramEmbed } from "@client/shared/services/api/types";
import type { ImageVariant } from "@questurian/lm-shared";
import { truncateUrl } from "../../utils";
import { DetailField } from "./DetailField";
import { AddInstagramEmbedForm } from "../forms/AddInstagramEmbedForm";
import { AddUploadFilesForm } from "../forms/AddUploadFilesForm";
import { ImageLightbox } from "../ui/ImageLightbox";
import { Button } from "@client/components/ui/button";
import { Check, X } from "lucide-react";
import { useToast } from "@client/shared/hooks/useToast";
import { useDeleteUpload } from "@client/shared/services/api/hooks/useDeleteUpload";
import { useDeleteInstagramEmbed } from "@client/shared/services/api/hooks/useDeleteInstagramEmbed";

interface LocationDetailViewProps {
  locationDetail: LocationResponse | null | undefined;
  isLoading: boolean;
  error: Error | null;
  onCopyField: (value: string, e: React.MouseEvent) => void;
}

/**
 * Component for displaying expanded location details
 * Shows core fields, completeness status, Instagram embeds, and uploads
 */
export function LocationDetailView({ locationDetail, isLoading, error, onCopyField }: LocationDetailViewProps) {
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
    locationId: locationDetail?.id || 0,
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
    locationId: locationDetail?.id || 0,
    onSuccess: () => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast("Instagram embed deleted successfully", centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to delete Instagram embed", centerPosition);
    },
  });

  const requiredFields = useMemo(() => {
    if (!locationDetail) return [];

    const contact = locationDetail.contact || {};
    const source = locationDetail.source || {};
    const hasOperationHours = Boolean(
      locationDetail.operationHours &&
        (typeof locationDetail.operationHours === "string"
          ? locationDetail.operationHours.trim().length > 0
          : Object.keys(locationDetail.operationHours).length > 0)
    );

    const hasMedia =
      (locationDetail.uploads && locationDetail.uploads.length > 0) ||
      (locationDetail.instagram_embeds && locationDetail.instagram_embeds.length > 0);

    return [
      { key: "title", label: "Title", present: Boolean(locationDetail.title?.trim()) },
      { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
      { key: "sourceAddress", label: "Source Address", present: Boolean(source.address?.trim()) },
      { key: "category", label: "Category", present: Boolean(locationDetail.category) },
      { key: "type", label: "Type", present: Boolean(locationDetail.type?.trim()) },
      { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
      { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
      { key: "slug", label: "Slug", present: Boolean(locationDetail.slug?.trim()) },
      {
        key: "coordinates",
        label: "Coordinates",
        present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
      },
      {
        key: "ianaTimeId",
        label: "Time Zone (IANA)",
        present: Boolean(locationDetail.ianaTimeId?.trim()),
      },
      { key: "countryCode", label: "Country Code", present: Boolean(contact.countryCode?.trim()) },
      { key: "phone", label: "Phone", present: Boolean(contact.phoneNumber?.trim()) },
      { key: "website", label: "Website", present: Boolean(contact.website?.trim()) },
      { key: "contactAddress", label: "Contact Address", present: Boolean(contact.contactAddress?.trim()) },
      { key: "contactUrl", label: "Google URL", present: Boolean(contact.url?.trim()) },
      {
        key: "neighborhoodDescription",
        label: "Neighborhood",
        present: Boolean(locationDetail.neighborhoodDescription?.trim()),
      },
      { key: "operationHours", label: "Hours", present: hasOperationHours },
      { key: "media", label: "Images/Instagram", present: hasMedia },
    ];
  }, [locationDetail]);

  const missingFields = useMemo(
    () => requiredFields.filter((field) => !field.present),
    [requiredFields]
  );
  const isComplete = missingFields.length === 0;

  function handleImageSetClick(upload: Upload) {
    if ('imageSet' in upload && upload.imageSet) {
      const imageSet = upload.imageSet;
      if (imageSet && imageSet.variants) {
        // Extract all variant paths for the lightbox
        const variantPaths = imageSet.variants.map((v: ImageVariant) => v.path);

        // Find the index of the square variant (which is displayed in thumbnails)
        // Variant order: ['thumbnail', 'square', 'wide', 'portrait', 'hero']
        const squareVariantIndex = imageSet.variants.findIndex(v => v.type === 'square');
        const startIndex = squareVariantIndex >= 0 ? squareVariantIndex : 0;

        setLightboxState({
          isOpen: true,
          images: variantPaths,
          currentIndex: startIndex, // Start with square variant (displayed in thumbnails)
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
      imageMetadata: undefined, // Instagram embeds don't have metadata
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

  if (isLoading) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-600">Loading details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-sm text-red-600">
          Error loading details: {error.message}
        </p>
      </div>
    );
  }

  if (!locationDetail) {
    return null;
  }

  const sourceAddress = locationDetail.source?.address?.trim();
  const contactAddress = locationDetail.contact?.contactAddress?.trim();
  const showSourceAddress = Boolean(sourceAddress);
  const showContactAddress = Boolean(contactAddress) && contactAddress !== sourceAddress;
  const contactAddressLabel = showSourceAddress ? "Contact Address" : "Address";

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2 py-1 rounded ${
                isComplete
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {isComplete ? "Complete" : "Missing data"}
            </span>
            <span className="text-xs text-muted-foreground">
              {isComplete
                ? "All required fields present"
                : `${missingFields.length} required field${
                    missingFields.length === 1 ? "" : "s"
                  } missing`}
            </span>
          </div>
          {!isComplete && (
            <div className="flex flex-wrap gap-1">
              {missingFields.map((field) => (
                <span
                  key={field.key}
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700"
                >
                  {field.label}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {requiredFields.map((field) => (
              <div
                key={field.key}
                className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${
                  field.present
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {field.present ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                <span>{field.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Title field - only show if different from source name */}
        {locationDetail.title && locationDetail.title !== locationDetail.source?.name && (
          <DetailField
            label="Title"
            value={locationDetail.title}
          />
        )}

        {showSourceAddress && (
          <DetailField
            label="Source Address"
            value={sourceAddress}
            onClick={(e) => onCopyField(sourceAddress!, e)}
            title="Click to copy source address"
          />
        )}

        {showContactAddress && (
          <DetailField
            label={contactAddressLabel}
            value={contactAddress}
            onClick={(e) => onCopyField(contactAddress!, e)}
            title="Click to copy contact address"
          />
        )}


        {/* Phone number field */}
        {locationDetail.contact?.phoneNumber && (
          <DetailField
            label="Phone"
            value={locationDetail.contact.phoneNumber}
            onClick={(e) => onCopyField(locationDetail.contact!.phoneNumber!, e)}
            title="Click to copy phone number"
          />
        )}

        {/* Website field */}
        {locationDetail.contact?.website && (
          <DetailField
            label="Website"
            value={truncateUrl(locationDetail.contact.website)}
            onClick={(e) => onCopyField(locationDetail.contact.website, e)}
            title="Click to copy website URL"
            valueClassName="text-sm text-blue-600 hover:text-blue-700 cursor-pointer underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors break-all"
          />
        )}

        {/* Email field */}
        {locationDetail.contact?.email && (
          <DetailField
            label="Email"
            value={locationDetail.contact.email}
            onClick={(e) => onCopyField(locationDetail.contact.email, e)}
            title="Click to copy email"
            valueClassName="text-sm text-blue-600 hover:text-blue-700 cursor-pointer underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors break-all"
          />
        )}

        {/* Google Maps URL field */}
        {locationDetail.contact?.url && (
          <DetailField
            label="Google URL"
            value={truncateUrl(locationDetail.contact.url)}
            onClick={(e) => onCopyField(locationDetail.contact.url, e)}
            title="Click to copy Google Maps URL"
            valueClassName="text-sm text-blue-600 hover:text-blue-700 cursor-pointer underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors break-all"
          />
        )}

        {locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null && (
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-fit">
              Coordinates:
            </span>
            <div className="flex gap-1 items-baseline">
              <span
                className="text-sm text-gray-900 font-mono cursor-pointer underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors"
                onClick={(e) => onCopyField(locationDetail.coordinates?.lat?.toString() || "", e)}
                title="Click to copy latitude"
              >
                {locationDetail.coordinates.lat}
              </span>
              <span className="text-sm text-gray-500">, </span>
              <span
                className="text-sm text-gray-900 font-mono cursor-pointer underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors"
                onClick={(e) => onCopyField(locationDetail.coordinates?.lng?.toString() || "", e)}
                title="Click to copy longitude"
              >
                {locationDetail.coordinates.lng}
              </span>
            </div>
          </div>
        )}

        {locationDetail.ianaTimeId && (
          <DetailField
            label="Time Zone (IANA)"
            value={locationDetail.ianaTimeId}
            onClick={(e) => onCopyField(locationDetail.ianaTimeId!, e)}
            title="Click to copy IANA time zone"
          />
        )}

        {/* Existing Uploads Gallery - above add forms */}
        {locationDetail.uploads && locationDetail.uploads.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Uploaded Images:
            </span>
            <ul className="flex gap-2 ml-4 flex-wrap">
              {locationDetail.uploads.map((upload) => {
                // Handle ImageSet format (multi-variant system)
                if (upload.imageSet) {
                  const imageSet = upload.imageSet;
                  // Find square variant (1:1 aspect ratio) for display
                  const squareVariant = imageSet.variants?.find(v => v.type === 'square');
                  if (!squareVariant) return null;

                  const imageUrl = `/api/images/${squareVariant.path.replace(/^data\/images\//, '')}`;
                  return (
                    <li key={`${upload.id}-imageset`} className="relative group">
                      <div className="shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-gray-100 hover:ring-2 ring-blue-400 transition-all">
                        <img
                          src={imageUrl}
                          alt={imageSet.altText || imageSet.photographerCredit || "Uploaded image"}
                          className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                          loading="lazy"
                          onClick={() => handleImageSetClick(upload)}
                          title={imageSet.photographerCredit || "Click to view all variants"}
                        />
                        </div>
                        {/* Badge showing variant count */}
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                          5 variants
                        </div>
                        {/* Delete button */}
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

        {/* Existing Instagram Embeds List - above add forms */}
        {locationDetail.instagram_embeds && locationDetail.instagram_embeds.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Instagram Posts:
            </span>
            <ul className="flex gap-2 ml-4 flex-wrap">
              {locationDetail.instagram_embeds.map((embed) => {
                // Get first image if available
                const firstImage = embed.images?.[0];
                const imageUrl = firstImage
                  ? `/api/images/${firstImage.replace(/^data\/images\//, '')}`
                  : null;

                return (
                  <li key={embed.id} className="relative group">
                    {/* Thumbnail icon */}
                    {imageUrl && (
                      <div className="shrink-0 w-[120px] h-[120px] overflow-hidden rounded bg-gray-100 hover:ring-2 ring-blue-400 transition-all">
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
                    {/* Delete button */}
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

        {/* Instagram and Upload Forms: Side by side - below existing content */}
        <div className="flex gap-4">
          {/* Instagram Section: Form only */}
          <div className="flex-1">
            <AddInstagramEmbedForm locationId={locationDetail.id} />
          </div>

          {/* Upload Section: Form only */}
          <div className="flex-1">
            <AddUploadFilesForm locationId={locationDetail.id} />
          </div>
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

    </div>
  );
}
