import { useEffect, useMemo, useState } from "react";
import type { LocationResponse, Upload, ImageMetadata, InstagramEmbed } from "@client/shared/services/api/types";
import type { ImageVariant } from "@questurian/lm-shared";
import { DetailField } from "./DetailField";
import { AddInstagramEmbedForm } from "../forms/AddInstagramEmbedForm";
import { AddUploadFilesForm } from "../forms/AddUploadFilesForm";
import { ImageLightbox } from "../ui/ImageLightbox";
import { ReviewsStatusBadge } from "../ui/ReviewsStatusBadge";
import {
  Button,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui";
import { Check, ChevronDown, ChevronUp, X, Download } from "lucide-react";
import { useToast } from "@client/shared/hooks/useToast";
import { useDeleteUpload } from "@client/shared/services/api/hooks/useDeleteUpload";
import { useDeleteInstagramEmbed } from "@client/shared/services/api/hooks/useDeleteInstagramEmbed";
import { useUpdateLocation } from "@client/shared/services/api/hooks/useUpdateLocation";
import { locationsApi } from "@client/shared/services/api/locations.api";
import { IDEAL_FOR_TAG_GROUPS, type IdealForTag } from "@shared/types/location-ideal-for";

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
  const { mutate: updateLocation, isPending: isUpdatingLocation } = useUpdateLocation();
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

  const hasIdealFor = Boolean(
    Array.isArray(locationDetail?.idealFor) && locationDetail.idealFor.length > 0
  );
  const [idealForDraft, setIdealForDraft] = useState<IdealForTag[]>([]);

  useEffect(() => {
    // Reset draft whenever the loaded location changes or once tags are saved.
    setIdealForDraft([]);
  }, [locationDetail?.id, hasIdealFor]);

  const addIdealForTag = (tag: string) => {
    if (isUpdatingLocation) return;

    setIdealForDraft((prev) => {
      const nextTag = tag as IdealForTag;
      if (prev.includes(nextTag) || prev.length >= 4) return prev;
      return [...prev, nextTag];
    });
  };

  const removeIdealForTag = (tagToRemove: IdealForTag) => {
    setIdealForDraft((prev) => prev.filter((tag) => tag !== tagToRemove));
  };

  const submitIdealForTags = () => {
    if (!locationDetail || isUpdatingLocation || idealForDraft.length === 0) return;

    updateLocation(
      {
        id: locationDetail.id,
        data: { idealFor: idealForDraft },
      },
      {
        onSuccess: () => {
          const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast("Ideal For tags saved", centerPosition);
        },
        onError: (updateError) => {
          const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast(updateError.message || "Failed to save Ideal For tags", centerPosition);
        },
      }
    );
  };

  const availableIdealForGroups = IDEAL_FOR_TAG_GROUPS.map((group) => ({
    ...group,
    tags: group.tags.filter((tag) => !idealForDraft.includes(tag)),
  })).filter((group) => group.tags.length > 0);

  const requiredFields = useMemo(() => {
    if (!locationDetail) return [];

    const contact = locationDetail.contact || {};
    const source = locationDetail.source || {};
    const hasOperationHours = Boolean(
      locationDetail.operationHours &&
        Object.keys(locationDetail.operationHours).length > 0
    );

    const hasMedia =
      (locationDetail.uploads && locationDetail.uploads.length > 0) ||
      (locationDetail.instagram_embeds && locationDetail.instagram_embeds.length > 0);
    const hasIdealFor = Boolean(Array.isArray(locationDetail.idealFor) && locationDetail.idealFor.length > 0);

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
      { key: "idealFor", label: "Ideal For", present: hasIdealFor },
      { key: "operationHours", label: "Hours", present: hasOperationHours },
      { key: "media", label: "Images/Instagram", present: hasMedia },
    ];
  }, [locationDetail]);

  const missingFields = useMemo(
    () => requiredFields.filter((field) => !field.present),
    [requiredFields]
  );
  const isComplete = missingFields.length === 0;

  // Expand when incomplete, collapse when complete; user can override via toggle
  const [completenessExpanded, setCompletenessExpanded] = useState<boolean | undefined>(undefined);
  const isCompletenessExpanded = completenessExpanded ?? !isComplete;

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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${
                  isComplete
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {isComplete ? "Complete" : "Missing data"}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {isComplete
                  ? "All required fields present"
                  : `${missingFields.length} required field${
                      missingFields.length === 1 ? "" : "s"
                    } missing`}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => setCompletenessExpanded(!isCompletenessExpanded)}
              aria-expanded={isCompletenessExpanded}
            >
              {isCompletenessExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5 mr-0.5" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5 mr-0.5" />
                  Expand
                </>
              )}
            </Button>
          </div>
          {isCompletenessExpanded && (
            <>
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
            </>
          )}
        </div>

        {/* Reviews Section - Separate from Completeness */}
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Reviews</span>
            <ReviewsStatusBadge
              hasReviews={!!locationDetail.reviewsFetchedAt}
              reviewsCount={locationDetail.reviewsCount}
              reviewsFetchedAt={locationDetail.reviewsFetchedAt}
            />
          </div>
          {locationDetail.reviewsFetchedAt && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Google: {locationDetail.reviewsGoogleCount || 0}</span>
              <span>TripAdvisor: {locationDetail.reviewsTripadvisorCount || 0}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  window.open(locationsApi.getMergedReviewsDownloadUrl(locationDetail.id), "_blank");
                }}
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
          )}
        </div>

        {!hasIdealFor && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
            <span className="text-sm font-medium text-foreground">Set Ideal For</span>
            <Select
              key={`${isUpdatingLocation ? "updating" : "ready"}-${idealForDraft.join("|") || "empty"}`}
              value={undefined}
              onValueChange={addIdealForTag}
              disabled={
                isUpdatingLocation ||
                idealForDraft.length >= 4 ||
                availableIdealForGroups.length === 0
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue
                  placeholder={
                    isUpdatingLocation
                      ? "Saving..."
                      : idealForDraft.length >= 4
                        ? "Maximum 4 tags selected"
                        : "Choose tags (1-4)"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableIdealForGroups.map((group, groupIndex) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </SelectLabel>
                    {group.tags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                    {groupIndex < availableIdealForGroups.length - 1 && <SelectSeparator />}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {idealForDraft.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {idealForDraft.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      className="rounded-sm text-muted-foreground hover:text-foreground"
                      onClick={() => removeIdealForTag(tag)}
                      aria-label={`Remove ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={submitIdealForTags}
                disabled={isUpdatingLocation || idealForDraft.length === 0}
              >
                {isUpdatingLocation ? "Saving..." : "Set Ideal For"}
              </Button>
              {idealForDraft.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIdealForDraft([])}
                  disabled={isUpdatingLocation}
                >
                  Clear
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {idealForDraft.length}/4 selected. This appears only when no Ideal For tag is set.
            </p>
          </div>
        )}

        {/* Title field - only show if different from source name */}
        {locationDetail.title && locationDetail.title !== locationDetail.source?.name && (
          <DetailField
            label="Title"
            value={locationDetail.title}
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
