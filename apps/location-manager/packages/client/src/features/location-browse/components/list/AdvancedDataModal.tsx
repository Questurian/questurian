import { useEffect, useState } from "react";
import type {
  LocationResponse,
  FetchReviewsPipelineRequest,
  ReviewsPipelineJobStatus,
} from "@client/shared/services/api/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { RefreshCw, Star, Loader2 } from "lucide-react";
import { DetailField } from "./DetailField";
import { useToast } from "@client/shared/hooks/useToast";
import { useUpdateLocation, locationsApi } from "@client/shared/services/api";
import { useRefetchPlaceId } from "@client/shared/services/api/hooks/useRefetchPlaceId";
import { useFetchReviewsPipeline } from "@client/shared/services/api/hooks/useReviewsPipeline";
import {
  useDownloadMergedReviews,
  useMergedReviewsReport,
  useMergedReviewsStatus,
} from "@client/shared/services/api/hooks/useMergedReviews";
import {
  useFetchTripAdvisorPlace,
  useTripAdvisorPlaceStatus,
  useDownloadTripAdvisorPlace,
} from "@client/shared/services/api/hooks/useTripAdvisorPlace";
import { FetchReviewsPipelineModal } from "../ui/FetchReviewsPipelineModal";
import { ReviewsReportDialog } from "../ui/ReviewsReportDialog";

interface AdvancedDataModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  locationDetail: LocationResponse | null | undefined;
  isLoading: boolean;
  error: Error | null;
  onCopyField: (value: string, e: React.MouseEvent) => void;
}

export function AdvancedDataModal({
  isOpen,
  onOpenChange,
  locationDetail,
  isLoading,
  error,
  onCopyField,
}: AdvancedDataModalProps) {
  const { showToast } = useToast();
  const [tripadvisorUrlInput, setTripadvisorUrlInput] = useState("");
  const [isReviewsPipelineModalOpen, setIsReviewsPipelineModalOpen] = useState(false);
  const [isReviewsReportDialogOpen, setIsReviewsReportDialogOpen] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<ReviewsPipelineJobStatus | null>(null);

  const updateLocationMutation = useUpdateLocation();

  useEffect(() => {
    if (!isOpen) return;
    setTripadvisorUrlInput(locationDetail?.tripadvisorUrl ?? "");
    setPipelineStatus(null);
  }, [isOpen, locationDetail?.tripadvisorUrl]);

  const canFetchGoogle = Boolean(locationDetail?.placeId);
  const canFetchTripadvisor = Boolean(locationDetail?.tripadvisorUrl);
  const canRunPipeline = canFetchGoogle || canFetchTripadvisor;

  const mergedReviewsStatusQuery = useMergedReviewsStatus({
    locationId: locationDetail?.id || 0,
    enabled: isOpen && Boolean(locationDetail?.id),
  });
  const mergedReviewsReportQuery = useMergedReviewsReport({
    locationId: locationDetail?.id || 0,
    enabled: isReviewsReportDialogOpen && Boolean(locationDetail?.id),
  });
  const downloadMergedReviews = useDownloadMergedReviews();

  const tripAdvisorPlaceStatusQuery = useTripAdvisorPlaceStatus({
    locationId: locationDetail?.id || 0,
    enabled: isOpen && Boolean(locationDetail?.id),
  });
  const downloadTripAdvisorPlace = useDownloadTripAdvisorPlace();
  const canDownloadAiJson = Boolean(
    tripAdvisorPlaceStatusQuery.data?.hasPlaceData &&
      mergedReviewsStatusQuery.data?.hasMergedReviews &&
      locationDetail?.neighborhoodDescription?.trim()
  );

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

  const fetchTripAdvisorPlaceMutation = useFetchTripAdvisorPlace({
    locationId: locationDetail?.id || 0,
    onSuccess: (data) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(data.message, centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to fetch TripAdvisor place data", centerPosition);
    },
  });

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

  const locationName = locationDetail?.source?.name;

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
        },
        onError: (error) => {
          showToast(error.message || "Failed to save TripAdvisor URL", centerPosition);
        },
      }
    );
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setIsReviewsPipelineModalOpen(false);
      setIsReviewsReportDialogOpen(false);
      setPipelineStatus(null);
    }
    onOpenChange(open);
  }

  const tripadvisorUrlChanged =
    tripadvisorUrlInput.trim() !== (locationDetail?.tripadvisorUrl ?? "");

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[720px] text-foreground bg-background border-border">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Advanced Data
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            TripAdvisor, Google, and pipeline data. These fields are optional for completeness.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Loading advanced data...</p>
          </div>
        ) : error ? (
          <div className="py-8 rounded-lg bg-destructive/10 border border-destructive/20 p-4">
            <p className="text-sm text-destructive">Error loading details: {error.message}</p>
          </div>
        ) : !locationDetail ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No location data available.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  TripAdvisor
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {locationDetail.tripadvisorLocationId ? "ID available" : "ID missing"}
                </span>
              </div>
              {locationDetail.tripadvisorLocationId ? (
                <DetailField
                  label="TripAdvisor ID"
                  value={locationDetail.tripadvisorLocationId}
                  onClick={(e) => onCopyField(locationDetail.tripadvisorLocationId!, e)}
                  title="Click to copy TripAdvisor location ID"
                  valueClassName="text-sm text-foreground font-mono cursor-pointer underline underline-offset-2 decoration-muted-foreground hover:decoration-foreground transition-colors"
                />
              ) : (
                <p className="text-sm text-muted-foreground">No TripAdvisor ID yet.</p>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Input
                  value={tripadvisorUrlInput}
                  onChange={(e) => setTripadvisorUrlInput(e.target.value)}
                  placeholder="https://www.tripadvisor.com/..."
                  className="h-9 text-sm flex-1 min-w-0"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 text-sm shrink-0"
                  onClick={handleSaveTripadvisorUrl}
                  disabled={updateLocationMutation.isPending || !tripadvisorUrlChanged}
                >
                  {updateLocationMutation.isPending ? "Saving..." : "Save URL"}
                </Button>
              </div>
              {locationDetail.tripadvisorUrl && (
                <p className="text-xs text-muted-foreground">
                  Used for TripAdvisor reviews and place lookups.
                </p>
              )}
            </section>

            <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  Google Place ID
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {locationDetail.placeId ? "Available" : "Missing"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {locationDetail.placeId ? (
                  <span
                    className="text-sm text-foreground font-mono cursor-pointer underline underline-offset-2 decoration-muted-foreground hover:decoration-foreground transition-colors"
                    onClick={(e) => onCopyField(locationDetail.placeId!, e)}
                    title="Click to copy Google Place ID"
                  >
                    {locationDetail.placeId}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Not available</span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-sm"
                  onClick={() => refetchPlaceIdMutation.mutate()}
                  disabled={refetchPlaceIdMutation.isPending}
                  title={locationDetail.placeId ? "Refetch Place ID from Google" : "Fetch Place ID from Google"}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 shrink-0 ${refetchPlaceIdMutation.isPending ? "animate-spin" : ""}`} />
                  {refetchPlaceIdMutation.isPending ? "Fetching..." : "Refetch"}
                </Button>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  Reviews Pipeline
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {canRunPipeline ? "Ready" : "Needs Google or TripAdvisor"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {fetchReviewsPipelineMutation.isPending ? (
                  <span className="text-sm text-primary inline-flex items-center">
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin shrink-0" />
                    {pipelineStatus?.message || "Running pipeline..."}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Ready</span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-sm"
                  onClick={() => setIsReviewsPipelineModalOpen(true)}
                  disabled={fetchReviewsPipelineMutation.isPending || !canRunPipeline}
                  title={canRunPipeline ? "Fetch reviews and build the merged dataset" : "Add a Google Place ID or TripAdvisor URL first"}
                >
                  <Star className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  Fetch Reviews
                </Button>
                {mergedReviewsStatusQuery.data?.hasMergedReviews && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-sm"
                      onClick={() => setIsReviewsReportDialogOpen(true)}
                      disabled={fetchReviewsPipelineMutation.isPending}
                      title="View pipeline report (stats, translations, errors)"
                    >
                      View Report
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-sm"
                      onClick={() => downloadMergedReviews.download(locationDetail.id)}
                      disabled={fetchReviewsPipelineMutation.isPending}
                      title="Download the latest merged reviews file"
                    >
                      Download
                    </Button>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  TripAdvisor Place Data
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {canFetchTripadvisor ? "URL available" : "Requires TripAdvisor URL"}
                </span>
              </div>
              {canFetchTripadvisor ? (
                <div className="flex flex-wrap items-center gap-2">
                  {fetchTripAdvisorPlaceMutation.isPending ? (
                    <span className="text-sm text-primary inline-flex items-center">
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin shrink-0" />
                      Fetching place data...
                    </span>
                  ) : tripAdvisorPlaceStatusQuery.data?.hasPlaceData ? (
                    <span className="text-sm text-foreground">
                      {tripAdvisorPlaceStatusQuery.data.placeTitle || "Data available"}
                      {tripAdvisorPlaceStatusQuery.data.rating && ` (${tripAdvisorPlaceStatusQuery.data.rating})`}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Not fetched</span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 text-sm"
                    onClick={() => fetchTripAdvisorPlaceMutation.mutate()}
                    disabled={fetchTripAdvisorPlaceMutation.isPending}
                    title="Fetch TripAdvisor place data from SerpAPI"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 shrink-0 ${fetchTripAdvisorPlaceMutation.isPending ? "animate-spin" : ""}`} />
                    {tripAdvisorPlaceStatusQuery.data?.hasPlaceData ? "Refetch" : "Fetch"}
                  </Button>
                  {tripAdvisorPlaceStatusQuery.data?.hasPlaceData && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-sm"
                      onClick={() => downloadTripAdvisorPlace.download(locationDetail.id)}
                      disabled={fetchTripAdvisorPlaceMutation.isPending}
                      title="Download TripAdvisor place data as JSON"
                    >
                      Download
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add a TripAdvisor URL and save it to enable place data fetching.
                </p>
              )}
            </section>

            <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <span className="text-sm font-semibold text-foreground">
                Export
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-sm"
                  onClick={() => window.open(locationsApi.getLocationExportDownloadUrl(locationDetail.id), "_blank")}
                  title="Download location data with TripAdvisor place info (no reviews)"
                >
                  Export Location
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-sm"
                  onClick={() => window.open(locationsApi.getAiJsonDownloadUrl(locationDetail.id), "_blank")}
                  disabled={!canDownloadAiJson}
                  title={
                    canDownloadAiJson
                      ? "Download AI-JSON (core TripAdvisor fields + filtered reviews)"
                      : "Requires TripAdvisor place data, merged reviews, and neighborhood description"
                  }
                >
                  AI-JSON
                </Button>
              </div>
            </section>
          </div>
        )}
      </DialogContent>

      {locationDetail && (
        <>
          <FetchReviewsPipelineModal
            isOpen={isReviewsPipelineModalOpen}
            onClose={() => setIsReviewsPipelineModalOpen(false)}
            onFetch={handleFetchReviewsPipeline}
            isPending={fetchReviewsPipelineMutation.isPending}
            locationName={locationName}
            googleAvailable={canFetchGoogle}
            tripadvisorAvailable={canFetchTripadvisor}
            statusMessage={pipelineStatus?.message}
          />
          <ReviewsReportDialog
            isOpen={isReviewsReportDialogOpen}
            onClose={() => setIsReviewsReportDialogOpen(false)}
            report={mergedReviewsReportQuery.data}
            isLoading={mergedReviewsReportQuery.isLoading}
            error={mergedReviewsReportQuery.error}
            locationName={locationName}
          />
        </>
      )}
    </Dialog>
  );
}
