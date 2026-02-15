import type { LocationResponse } from "@client/shared/services/api/types";
import { Button } from "@client/components/ui";
import { Download } from "lucide-react";
import { ReviewsStatusBadge } from "../ui/ReviewsStatusBadge";
import { locationsApi } from "@client/shared/services/api/locations.api";

interface LocationReviewsSectionProps {
  locationDetail: LocationResponse;
}

export function LocationReviewsSection({ locationDetail }: LocationReviewsSectionProps) {
  return (
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
  );
}
