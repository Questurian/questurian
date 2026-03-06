import { useMemo, useState } from "react";
import type {
  FetchReviewsPipelineRequest,
  LocationResponse,
} from "@client/shared/services/api/types";
import { Button } from "@client/components/ui";
import { AlertTriangle, Check, Download, Loader2, RefreshCw, X } from "lucide-react";
import { useToast } from "@client/shared/hooks/useToast";
import { locationsApi } from "@client/shared/services/api/locations.api";
import { useFetchReviewsPipeline } from "@client/shared/services/api/hooks/useReviewsPipeline";
import { useMergedReviewsStatus, useMergedReviewsReport } from "@client/shared/services/api/hooks/useMergedReviews";
import { useUpdateLocation } from "@client/shared/services/api/hooks/useUpdateLocation";
import {
  useFetchTripAdvisorPlace,
  useTripAdvisorPlaceStatus,
} from "@client/shared/services/api/hooks/useTripAdvisorPlace";
import { ReviewsReportDialog } from "../ui/ReviewsReportDialog";
import { CompletenessFieldEditModal } from "./CompletenessFieldEditModal";

interface LocationReviewsSectionProps {
  locationDetail: LocationResponse;
}

export function LocationReviewsSection({ locationDetail }: LocationReviewsSectionProps) {
  const { showToast } = useToast();
  const updateLocationMutation = useUpdateLocation();
  const [editField, setEditField] = useState<{ key: string; label: string; present: boolean } | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const showReviewsToggle = locationDetail.category === "nightlife";
  const reviewsEnabled = showReviewsToggle ? locationDetail.reviewsEnabled !== false : true;
  const isReviewsDisabled = !reviewsEnabled;
  const hasReviews = reviewsEnabled && Boolean(locationDetail.reviewsFetchedAt);
  const canFetchGoogle = Boolean(locationDetail.placeId?.trim());
  const canFetchTripadvisor = Boolean(locationDetail.tripadvisorUrl?.trim());
  const canRunPipeline = reviewsEnabled && (canFetchGoogle || canFetchTripadvisor);
  const [pipelineStatusMessage, setPipelineStatusMessage] = useState<string | null>(null);
  const tripAdvisorPlaceStatusQuery = useTripAdvisorPlaceStatus({
    category: locationDetail.category,
    locationId: locationDetail.id,
    enabled: reviewsEnabled && Boolean(locationDetail.id),
  });
  const mergedReviewsStatusQuery = useMergedReviewsStatus({
    category: locationDetail.category,
    locationId: locationDetail.id,
    enabled: reviewsEnabled && Boolean(locationDetail.id),
  });
  const hasTripAdvisorPlaceData = Boolean(tripAdvisorPlaceStatusQuery.data?.hasPlaceData);
  const hasMergedReviews = Boolean(mergedReviewsStatusQuery.data?.hasMergedReviews);
  const [tripAdvisorFetchError, setTripAdvisorFetchError] = useState<string | null>(null);

  const fetchTripAdvisorPlaceMutation = useFetchTripAdvisorPlace({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: (data) => {
      setTripAdvisorFetchError(null);
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(data.message, centerPosition);
    },
    onError: (error) => {
      setTripAdvisorFetchError(error.message || "Failed to fetch TripAdvisor place data");
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to fetch TripAdvisor place data", centerPosition);
    },
  });
  const mergedReviewsReportQuery = useMergedReviewsReport({
    category: locationDetail.category,
    locationId: locationDetail.id,
    enabled: reviewsEnabled && hasMergedReviews && isReportOpen,
  });
  const hasNeighborhoodDescription = Boolean(locationDetail.neighborhoodDescription?.trim());

  const reviewSupportFields = useMemo(
    () => [
      {
        key: "tripadvisorPlaceData",
        label: "TripAdvisor place data",
        present: Boolean(tripAdvisorPlaceStatusQuery.data?.hasPlaceData),
      },
      {
        key: "mergedReviews",
        label: "Merged reviews",
        present: hasMergedReviews,
      },
      {
        key: "neighborhoodDescription",
        label: "Neighborhood description",
        present: hasNeighborhoodDescription,
      },
    ],
    [
      hasNeighborhoodDescription,
      hasMergedReviews,
      tripAdvisorPlaceStatusQuery.data?.hasPlaceData,
    ]
  );
  const canDownloadAiJson = hasMergedReviews;

  const sources = useMemo<FetchReviewsPipelineRequest["sources"]>(() => {
    if (!reviewsEnabled) {
      return [];
    }
    const selectedSources: FetchReviewsPipelineRequest["sources"] = [];
    if (canFetchGoogle) selectedSources.push("google");
    if (canFetchTripadvisor) selectedSources.push("tripadvisor");
    return selectedSources;
  }, [reviewsEnabled, canFetchGoogle, canFetchTripadvisor]);

  const fetchReviewsPipelineMutation = useFetchReviewsPipeline({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: (data) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const warningsCount = data.warnings?.length || 0;
      const warningSuffix = warningsCount > 0
        ? ` (${warningsCount} warning${warningsCount > 1 ? "s" : ""})`
        : "";
      showToast(`${data.message}${warningSuffix}`, centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to fetch reviews", centerPosition);
    },
    onProgress: (status) => {
      setPipelineStatusMessage(status.message || null);
    },
    onSettled: () => {
      setPipelineStatusMessage(null);
    },
  });

  function handleFetchReviews() {
    if (!sources.length || fetchReviewsPipelineMutation.isPending) return;
    fetchReviewsPipelineMutation.mutate({ sources });
  }

  function handleMergedReviewsClick(present: boolean) {
    if (present) {
      setIsReportOpen(true);
    } else if (canRunPipeline) {
      handleFetchReviews();
    }
  }

  function handleReviewsToggle(nextValue: boolean) {
    if (updateLocationMutation.isPending) {
      return;
    }

    updateLocationMutation.mutate(
      {
        category: locationDetail.category,
        id: locationDetail.id,
        data: { reviewsEnabled: nextValue },
      },
      {
        onSuccess: () => {
          const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast(
            nextValue
              ? "Review fetching enabled for this document."
              : "Review fetching disabled for this document.",
            centerPosition
          );
        },
        onError: (error) => {
          const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          showToast(error.message || "Failed to update review toggle", centerPosition);
        },
      }
    );
  }

  const statusText = isReviewsDisabled
    ? "Review fetching is disabled for this document."
    : fetchReviewsPipelineMutation.isPending
    ? (pipelineStatusMessage || "Running reviews pipeline...")
    : hasReviews
      ? `Google: ${locationDetail.reviewsGoogleCount || 0} • TripAdvisor: ${locationDetail.reviewsTripadvisorCount || 0}`
      : canRunPipeline
        ? "Source IDs ready. Fetch reviews to build merged review data."
        : "Add a Google Place ID or TripAdvisor URL to fetch reviews.";

  const isMergedReviewsLoading = fetchReviewsPipelineMutation.isPending;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          {isReviewsDisabled ? "Reviews disabled" : hasReviews ? "Reviews available" : "No reviews"}
        </span>
        <span className="text-[11px] text-muted-foreground/80">
          {statusText}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {showReviewsToggle && (
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={reviewsEnabled}
                onChange={(event) => handleReviewsToggle(event.target.checked)}
                disabled={updateLocationMutation.isPending}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50"
              />
              <span>{updateLocationMutation.isPending ? "Saving..." : "Fetch reviews"}</span>
            </label>
          )}
          {!isReviewsDisabled && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-w-38 justify-center px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleFetchReviews}
              disabled={fetchReviewsPipelineMutation.isPending || !canRunPipeline}
              title={canRunPipeline ? "Fetch and merge reviews from available sources" : "Add a Google Place ID or TripAdvisor URL first"}
            >
              {fetchReviewsPipelineMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              {fetchReviewsPipelineMutation.isPending ? "Fetching..." : (hasReviews ? "Refetch reviews" : "Fetch reviews")}
            </Button>
          )}
          {!isReviewsDisabled && hasReviews && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                window.open(
                  locationsApi.getMergedReviewsDownloadUrl(locationDetail.category, locationDetail.id),
                  "_blank"
                );
              }}
              disabled={fetchReviewsPipelineMutation.isPending}
              title="Download merged reviews file"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download
            </Button>
          )}
          {!isReviewsDisabled && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                window.open(
                  locationsApi.getAiJsonDownloadUrl(locationDetail.category, locationDetail.id),
                  "_blank"
                );
              }}
              disabled={fetchReviewsPipelineMutation.isPending || !canDownloadAiJson}
              title={
                canDownloadAiJson
                  ? "Download review2blog export JSON (category facts + normalized reviews)"
                  : "Requires merged reviews"
              }
            >
              AI-JSON
            </Button>
          )}
        </div>
      </div>
      {!isReviewsDisabled && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {reviewSupportFields.map((field) => {
            const isTripAdvisorField = field.key === "tripadvisorPlaceData";
            const isMergedField = field.key === "mergedReviews";
            const isNeighborhoodField = field.key === "neighborhoodDescription";
            const isMergedBlocked = isMergedField && !hasTripAdvisorPlaceData && !field.present;

            const isTripAdvisorLoading = fetchTripAdvisorPlaceMutation.isPending;
            const isTripAdvisorError = isTripAdvisorField && !field.present && tripAdvisorFetchError !== null;
            const hasTripAdvisorUrl = canFetchTripadvisor;

            const isTripAdvisorMissingUrl = isTripAdvisorField && !hasTripAdvisorUrl && !field.present;

            const isClickable = isTripAdvisorField
              ? !isTripAdvisorLoading && (hasTripAdvisorUrl || isTripAdvisorMissingUrl)
              : isMergedField
                ? !isMergedBlocked && (field.present || canRunPipeline) && !isMergedReviewsLoading
                : isNeighborhoodField
                  ? !field.present
                  : false;

            function handleClick() {
              if (isTripAdvisorField) {
                if (isTripAdvisorMissingUrl) {
                  setEditField({ key: "tripadvisorUrl", label: "TripAdvisor URL", present: false });
                } else if (hasTripAdvisorUrl && !isTripAdvisorLoading) {
                  setTripAdvisorFetchError(null);
                  fetchTripAdvisorPlaceMutation.mutate();
                }
              } else if (isMergedField && !isMergedBlocked) {
                handleMergedReviewsClick(field.present);
              } else if (isNeighborhoodField && !field.present) {
                setEditField(field);
              }
            }

            function getTitle(): string | undefined {
              if (isTripAdvisorField) {
                if (isTripAdvisorError) return `Fetch failed: ${tripAdvisorFetchError} — click to retry`;
                if (field.present) return "Click to refetch TripAdvisor place data";
                if (hasTripAdvisorUrl) return "Click to fetch TripAdvisor place data";
                return "TripAdvisor URL missing — click to add";
              }
              if (isMergedField) {
                if (isMergedBlocked) return "Requires TripAdvisor place data first";
                if (field.present) return "Click to view merged reviews report";
                if (canRunPipeline) return "Click to fetch and merge reviews";
                return "Add a Google Place ID or TripAdvisor URL first";
              }
              if (isNeighborhoodField && !field.present) return `Click to edit ${field.label}`;
              return undefined;
            }

            function getClassName(): string {
              const base = "flex items-center gap-2 rounded border px-2 py-1 text-xs transition-colors";
              if (isTripAdvisorField) {
                if (isTripAdvisorLoading) return `${base} border-blue-500/20 bg-blue-500/10 text-blue-400 cursor-wait`;
                if (isTripAdvisorError) return `${base} border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer`;
                if (field.present) return `${base} border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer`;
                if (hasTripAdvisorUrl) return `${base} border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer`;
                return `${base} border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer`;
              }
              if (isMergedBlocked) return `${base} border-zinc-500/20 bg-zinc-500/10 text-zinc-500 cursor-not-allowed opacity-50`;
              if (isMergedField && isMergedReviewsLoading) return `${base} border-blue-500/20 bg-blue-500/10 text-blue-400 cursor-wait`;
              if (field.present) {
                if (isMergedField) return `${base} border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer`;
                return `${base} border-emerald-500/20 bg-emerald-500/10 text-emerald-400 cursor-default`;
              }
              if (isClickable) return `${base} border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer text-left`;
              return `${base} border-amber-500/20 bg-amber-500/10 text-amber-400 cursor-default`;
            }

            function renderIcon() {
              if (isTripAdvisorField) {
                if (isTripAdvisorLoading) return <Loader2 className="h-3 w-3 animate-spin" />;
                if (isTripAdvisorError) return <AlertTriangle className="h-3 w-3" />;
                if (field.present) return <Check className="h-3 w-3" />;
                return <X className="h-3 w-3" />;
              }
              if (isMergedBlocked) return <X className="h-3 w-3" />;
              if (isMergedField && isMergedReviewsLoading) return <Loader2 className="h-3 w-3 animate-spin" />;
              if (field.present) return <Check className="h-3 w-3" />;
              return <X className="h-3 w-3" />;
            }

            function renderLabel() {
              if (isTripAdvisorField && isTripAdvisorLoading) return "Fetching place data...";
              if (isTripAdvisorField && isTripAdvisorError) return "Fetch failed — retry";
              if (isTripAdvisorMissingUrl) return "TripAdvisor URL missing";
              if (isMergedField && isMergedReviewsLoading) return pipelineStatusMessage || "Fetching reviews...";
              return field.label;
            }

            return (
              <button
                key={field.key}
                type="button"
                onClick={handleClick}
                disabled={!isClickable}
                title={getTitle()}
                className={getClassName()}
              >
                {renderIcon()}
                <span>{renderLabel()}</span>
              </button>
            );
          })}
        </div>
      )}

      {editField && (
        <CompletenessFieldEditModal
          field={editField}
          locationDetail={locationDetail}
          open={Boolean(editField)}
          onOpenChange={(open) => !open && setEditField(null)}
        />
      )}

      <ReviewsReportDialog
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        report={mergedReviewsReportQuery.data ?? null}
        isLoading={mergedReviewsReportQuery.isLoading}
        error={mergedReviewsReportQuery.error}
        locationName={locationDetail.source?.name}
      />
    </div>
  );
}
