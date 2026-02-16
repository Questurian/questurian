import { useMemo, useState } from "react";
import type {
  FetchReviewsPipelineRequest,
  LocationResponse,
} from "@client/shared/services/api/types";
import { Button } from "@client/components/ui";
import { Check, Download, Loader2, RefreshCw, X } from "lucide-react";
import { useToast } from "@client/shared/hooks/useToast";
import { locationsApi } from "@client/shared/services/api/locations.api";
import { useFetchReviewsPipeline } from "@client/shared/services/api/hooks/useReviewsPipeline";
import { useMergedReviewsStatus } from "@client/shared/services/api/hooks/useMergedReviews";
import { useTripAdvisorPlaceStatus } from "@client/shared/services/api/hooks/useTripAdvisorPlace";
import { CompletenessFieldEditModal } from "./CompletenessFieldEditModal";

interface LocationReviewsSectionProps {
  locationDetail: LocationResponse;
}

export function LocationReviewsSection({ locationDetail }: LocationReviewsSectionProps) {
  const { showToast } = useToast();
  const [editField, setEditField] = useState<{ key: string; label: string; present: boolean } | null>(null);
  const hasReviews = Boolean(locationDetail.reviewsFetchedAt);
  const canFetchGoogle = Boolean(locationDetail.placeId?.trim());
  const canFetchTripadvisor = Boolean(locationDetail.tripadvisorUrl?.trim());
  const canRunPipeline = canFetchGoogle || canFetchTripadvisor;
  const [pipelineStatusMessage, setPipelineStatusMessage] = useState<string | null>(null);
  const tripAdvisorPlaceStatusQuery = useTripAdvisorPlaceStatus({
    locationId: locationDetail.id,
    enabled: Boolean(locationDetail.id),
  });
  const mergedReviewsStatusQuery = useMergedReviewsStatus({
    locationId: locationDetail.id,
    enabled: Boolean(locationDetail.id),
  });
  const hasNeighborhoodDescription = Boolean(locationDetail.neighborhoodDescription?.trim());

  const aiJsonPrerequisites = useMemo(
    () => [
      {
        key: "tripadvisorPlaceData",
        label: "TripAdvisor place data",
        present: Boolean(tripAdvisorPlaceStatusQuery.data?.hasPlaceData),
      },
      {
        key: "mergedReviews",
        label: "Merged reviews",
        present: Boolean(mergedReviewsStatusQuery.data?.hasMergedReviews),
      },
      {
        key: "neighborhoodDescription",
        label: "Neighborhood description",
        present: hasNeighborhoodDescription,
      },
    ],
    [
      hasNeighborhoodDescription,
      mergedReviewsStatusQuery.data?.hasMergedReviews,
      tripAdvisorPlaceStatusQuery.data?.hasPlaceData,
    ]
  );
  const canDownloadAiJson = aiJsonPrerequisites.every((field) => field.present);

  const sources = useMemo<FetchReviewsPipelineRequest["sources"]>(() => {
    const selectedSources: FetchReviewsPipelineRequest["sources"] = [];
    if (canFetchGoogle) selectedSources.push("google");
    if (canFetchTripadvisor) selectedSources.push("tripadvisor");
    return selectedSources;
  }, [canFetchGoogle, canFetchTripadvisor]);

  const fetchReviewsPipelineMutation = useFetchReviewsPipeline({
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

  const statusText = fetchReviewsPipelineMutation.isPending
    ? (pipelineStatusMessage || "Running reviews pipeline...")
    : hasReviews
      ? `Google: ${locationDetail.reviewsGoogleCount || 0} • TripAdvisor: ${locationDetail.reviewsTripadvisorCount || 0}`
      : canRunPipeline
        ? "Source IDs ready. Fetch reviews to build merged review data."
        : "Add a Google Place ID or TripAdvisor URL to fetch reviews.";

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          {hasReviews ? "Reviews available" : "No reviews"}
        </span>
        <span className="text-[11px] text-muted-foreground/80">
          {statusText}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 min-w-38 justify-center px-2 text-xs text-muted-foreground hover:text-foreground"
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
        {hasReviews && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              window.open(locationsApi.getMergedReviewsDownloadUrl(locationDetail.id), "_blank");
            }}
            disabled={fetchReviewsPipelineMutation.isPending}
            title="Download merged reviews file"
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Download
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            window.open(locationsApi.getAiJsonDownloadUrl(locationDetail.id), "_blank");
          }}
          disabled={fetchReviewsPipelineMutation.isPending || !canDownloadAiJson}
          title={
            canDownloadAiJson
              ? "Download AI-JSON (requires place data, merged reviews, and neighborhood description)"
              : "Missing prerequisites: TripAdvisor place data, merged reviews, or neighborhood description"
          }
        >
          AI-JSON
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {aiJsonPrerequisites.map((field) => (
          <button
            key={field.key}
            type="button"
            onClick={() =>
              !field.present &&
              field.key === "neighborhoodDescription" &&
              setEditField(field)
            }
            disabled={field.present || field.key !== "neighborhoodDescription"}
            title={
              !field.present && field.key === "neighborhoodDescription"
                ? `Click to edit ${field.label}`
                : undefined
            }
            className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${
              field.present
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 cursor-default"
                : field.key === "neighborhoodDescription"
                  ? "border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer text-left"
                  : "border-amber-500/20 bg-amber-500/10 text-amber-400 cursor-default"
            }`}
          >
            {field.present ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            <span>{field.label}</span>
          </button>
        ))}
      </div>

      {editField && (
        <CompletenessFieldEditModal
          field={editField}
          locationDetail={locationDetail}
          open={Boolean(editField)}
          onOpenChange={(open) => !open && setEditField(null)}
        />
      )}
    </div>
  );
}
