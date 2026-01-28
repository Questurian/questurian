import { useState } from "react";
import type { LocationResponse, Upload, ImageMetadata, InstagramEmbed, FetchReviewsPipelineRequest, ReviewsPipelineJobStatus } from "@client/shared/services/api/types";
import type { ImageVariant } from "@questurian/lm-shared";
import { truncateUrl } from "../../utils";
import { DetailField } from "./DetailField";
import { AddInstagramEmbedForm } from "../forms/AddInstagramEmbedForm";
import { AddUploadFilesForm } from "../forms/AddUploadFilesForm";
import { ImageLightbox } from "../ui/ImageLightbox";
import { FetchReviewsPipelineModal } from "../ui/FetchReviewsPipelineModal";
import { ReviewsReportDialog } from "../ui/ReviewsReportDialog";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { X, RefreshCw, Star, Loader2 } from "lucide-react";
import { useToast } from "@client/shared/hooks/useToast";
import { useDeleteUpload } from "@client/shared/services/api/hooks/useDeleteUpload";
import { useDeleteInstagramEmbed } from "@client/shared/services/api/hooks/useDeleteInstagramEmbed";
import { useDownloadMergedReviews, useMergedReviewsStatus, useMergedReviewsReport } from "@client/shared/services/api/hooks/useMergedReviews";
import { useRefetchPlaceId } from "@client/shared/services/api/hooks/useRefetchPlaceId";
import { useFetchReviewsPipeline } from "@client/shared/services/api/hooks/useReviewsPipeline";
import { useUpdateLocation } from "@client/shared/services/api";

interface LocationDetailViewProps {
  locationDetail: LocationResponse | null | undefined;
  isLoading: boolean;
  error: Error | null;
  onCopyField: (value: string, e: React.MouseEvent) => void;
}

/**
 * Component for displaying expanded location details
 * Shows all location fields, Instagram embeds, and uploads
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

  // Reviews state and hooks
  const [isReviewsPipelineModalOpen, setIsReviewsPipelineModalOpen] = useState(false);
  const [isReviewsReportDialogOpen, setIsReviewsReportDialogOpen] = useState(false);
  const [tripadvisorUrlInput, setTripadvisorUrlInput] = useState("");
  const [pipelineStatus, setPipelineStatus] = useState<ReviewsPipelineJobStatus | null>(null);

  const updateLocationMutation = useUpdateLocation();

  const refetchPlaceIdMutation = useRefetchPlaceId({
    locationId: locationDetail?.id || 0,
    onSuccess: (placeId) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(placeId ? `Place ID updated: ${placeId}` : "No Place ID found", centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to refetch Place ID", centerPosition);
    },
  });

  const canFetchGoogle = Boolean(locationDetail?.placeId);
  const canFetchTripadvisor = Boolean(locationDetail?.tripadvisorUrl);
  const canRunPipeline = canFetchGoogle || canFetchTripadvisor;

  const mergedReviewsStatusQuery = useMergedReviewsStatus({
    locationId: locationDetail?.id || 0,
    enabled: Boolean(locationDetail?.id),
  });
  const mergedReviewsReportQuery = useMergedReviewsReport({
    locationId: locationDetail?.id || 0,
    enabled: isReviewsReportDialogOpen && Boolean(locationDetail?.id),
  });
  const downloadMergedReviews = useDownloadMergedReviews();

  const fetchReviewsPipelineMutation = useFetchReviewsPipeline({
    locationId: locationDetail?.id || 0,
    onSuccess: (data) => {
      setPipelineStatus(null);
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      let message = data.message;
      if (data.warnings && data.warnings.length > 0) {
        message += ` (${data.warnings.length} warning${data.warnings.length > 1 ? "s" : ""})`;
      }
      showToast(message, centerPosition);
      setIsReviewsPipelineModalOpen(false);
    },
    onError: (error) => {
      setPipelineStatus(null);
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to fetch reviews", centerPosition);
    },
    onProgress: (status) => {
      setPipelineStatus(status);
    },
    onSettled: () => undefined,
  });

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

  function handleFetchReviewsPipeline(params: FetchReviewsPipelineRequest) {
    fetchReviewsPipelineMutation.mutate(params);
  }

  function handleSaveTripadvisorUrl() {
    if (!locationDetail?.id) return;
    const trimmed = tripadvisorUrlInput.trim();
    const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    if (!trimmed) {
      showToast("TripAdvisor URL is required", centerPosition);
      return;
    }

    updateLocationMutation.mutate(
      { id: locationDetail.id, data: { tripadvisorUrl: trimmed } },
      {
        onSuccess: () => {
          showToast("TripAdvisor URL saved successfully", centerPosition);
          setTripadvisorUrlInput("");
        },
        onError: (error) => {
          showToast(error.message || "Failed to save TripAdvisor URL", centerPosition);
        },
      }
    );
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

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="space-y-3">
        {/* Title field - only show if different from source name */}
        {locationDetail.title && locationDetail.title !== locationDetail.source?.name && (
          <DetailField
            label="Title"
            value={locationDetail.title}
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

        {/* TripAdvisor */}
        {locationDetail.tripadvisorLocationId ? (
          <DetailField
            label="TripAdvisor ID"
            value={locationDetail.tripadvisorLocationId}
            onClick={(e) => onCopyField(locationDetail.tripadvisorLocationId!, e)}
            title="Click to copy TripAdvisor location ID"
            valueClassName="text-sm text-gray-900 font-mono cursor-pointer underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors"
          />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-fit">
              TripAdvisor URL:
            </span>
            <div className="flex items-center gap-2 w-full">
              <Input
                value={tripadvisorUrlInput}
                onChange={(e) => setTripadvisorUrlInput(e.target.value)}
                placeholder="https://www.tripadvisor.com/..."
                className="h-8 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={handleSaveTripadvisorUrl}
                disabled={updateLocationMutation.isPending}
              >
                {updateLocationMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}

        {/* Google Place ID field */}
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-fit">
            Place ID:
          </span>
          <div className="flex items-center gap-2">
            {locationDetail.placeId ? (
              <span
                className="text-sm text-gray-900 font-mono cursor-pointer underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors"
                onClick={(e) => onCopyField(locationDetail.placeId!, e)}
                title="Click to copy Google Place ID"
              >
                {locationDetail.placeId}
              </span>
            ) : (
              <span className="text-sm text-gray-400 italic">Not available</span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => refetchPlaceIdMutation.mutate()}
              disabled={refetchPlaceIdMutation.isPending}
              title={locationDetail.placeId ? "Refetch Place ID from Google" : "Fetch Place ID from Google"}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${refetchPlaceIdMutation.isPending ? "animate-spin" : ""}`} />
              {refetchPlaceIdMutation.isPending ? "Fetching..." : "Refetch"}
            </Button>
          </div>
        </div>

        {/* Coordinates field - special handling for lat/lng */}
        {locationDetail.coordinates?.lat && locationDetail.coordinates?.lng && (
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-fit">
              Coordinates:
            </span>
            <div className="flex gap-1 items-baseline">
              <span
                className="text-sm text-gray-900 font-mono cursor-pointer underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors"
                onClick={(e) => onCopyField(locationDetail.coordinates?.lat?.toString() || '', e)}
                title="Click to copy latitude"
              >
                {locationDetail.coordinates.lat}
              </span>
              <span className="text-sm text-gray-500">, </span>
              <span
                className="text-sm text-gray-900 font-mono cursor-pointer underline underline-offset-2 decoration-gray-400 hover:decoration-gray-600 transition-colors"
                onClick={(e) => onCopyField(locationDetail.coordinates?.lng?.toString() || '', e)}
                title="Click to copy longitude"
              >
                {locationDetail.coordinates.lng}
              </span>
            </div>
          </div>
        )}

        {/* Reviews Pipeline Section */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Reviews Pipeline:
          </span>
          <div className="flex items-center gap-2">
            {fetchReviewsPipelineMutation.isPending ? (
              <span className="text-sm text-blue-600 inline-flex items-center">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                {pipelineStatus?.message || "Running pipeline..."}
              </span>
            ) : (
              <span className="text-sm text-gray-400 italic">Ready</span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setIsReviewsPipelineModalOpen(true)}
              disabled={fetchReviewsPipelineMutation.isPending || !canRunPipeline}
              title={canRunPipeline ? "Fetch reviews and build the merged dataset" : "Add a Google Place ID or TripAdvisor URL first"}
            >
              <Star className="h-3 w-3 mr-1" />
              Fetch Reviews
            </Button>
            {mergedReviewsStatusQuery.data?.hasMergedReviews && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setIsReviewsReportDialogOpen(true)}
                  disabled={fetchReviewsPipelineMutation.isPending}
                  title="View pipeline report (stats, translations, errors)"
                >
                  View Report
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => downloadMergedReviews.download(locationDetail.id)}
                  disabled={fetchReviewsPipelineMutation.isPending}
                  title="Download the latest merged reviews file"
                >
                  Download
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Instagram and Upload Forms: Side by side */}
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

        {/* Existing Uploads Gallery */}
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

        {/* Existing Instagram Embeds List */}
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

      {/* Fetch Reviews Pipeline Modal */}
      <FetchReviewsPipelineModal
        isOpen={isReviewsPipelineModalOpen}
        onClose={() => setIsReviewsPipelineModalOpen(false)}
        onFetch={handleFetchReviewsPipeline}
        isPending={fetchReviewsPipelineMutation.isPending}
        locationName={locationDetail.source?.name}
        googleAvailable={canFetchGoogle}
        tripadvisorAvailable={canFetchTripadvisor}
        statusMessage={pipelineStatus?.message}
      />

      {/* Reviews Report Dialog */}
      <ReviewsReportDialog
        isOpen={isReviewsReportDialogOpen}
        onClose={() => setIsReviewsReportDialogOpen(false)}
        report={mergedReviewsReportQuery.data}
        isLoading={mergedReviewsReportQuery.isLoading}
        error={mergedReviewsReportQuery.error}
        locationName={locationDetail.source?.name}
      />
    </div>
  );
}
