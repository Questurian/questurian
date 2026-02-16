import { useMemo } from "react";
import type { LocationResponse } from "@client/shared/services/api/types";
import { Button } from "@client/components/ui";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@client/shared/hooks/useToast";
import {
  useFetchTripAdvisorPlace,
  useTripAdvisorPlaceStatus,
} from "@client/shared/services/api/hooks/useTripAdvisorPlace";

interface LocationTripAdvisorSectionProps {
  locationDetail: LocationResponse;
}

function hasMissingRequiredFields(locationDetail: LocationResponse): boolean {
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
  const hasCuisines = Boolean(
    Array.isArray(locationDetail.tripadvisorCuisines) && locationDetail.tripadvisorCuisines.length > 0
  );

  const requiredChecks = [
    Boolean(locationDetail.title?.trim()),
    Boolean(source.name?.trim()),
    Boolean(source.address?.trim()),
    Boolean(locationDetail.category),
    Boolean(locationDetail.type?.trim()),
    Boolean(locationDetail.locationKey?.trim()),
    Boolean(locationDetail.district?.trim()),
    Boolean(locationDetail.slug?.trim()),
    locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
    Boolean(locationDetail.ianaTimeId?.trim()),
    Boolean(contact.countryCode?.trim()),
    Boolean(contact.phoneNumber?.trim()),
    Boolean(contact.website?.trim()),
    Boolean(contact.url?.trim()),
    Boolean(locationDetail.neighborhoodDescription?.trim()),
    hasIdealFor,
    hasCuisines,
    Boolean(locationDetail.priceLevel?.trim()),
    hasOperationHours,
    hasMedia,
  ];

  return requiredChecks.some((present) => !present);
}

export function LocationTripAdvisorSection({ locationDetail }: LocationTripAdvisorSectionProps) {
  const { showToast } = useToast();
  const hasTripadvisorUrl = Boolean(locationDetail.tripadvisorUrl?.trim());
  const shouldShow = useMemo(
    () => hasTripadvisorUrl && hasMissingRequiredFields(locationDetail),
    [hasTripadvisorUrl, locationDetail]
  );

  const tripAdvisorPlaceStatusQuery = useTripAdvisorPlaceStatus({
    locationId: locationDetail.id,
    enabled: shouldShow,
  });

  const fetchTripAdvisorPlaceMutation = useFetchTripAdvisorPlace({
    locationId: locationDetail.id,
    onSuccess: (data) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(data.message, centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to fetch TripAdvisor place data", centerPosition);
    },
  });

  if (!shouldShow) return null;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          TripAdvisor URL set
        </span>
        <span className="text-[11px] text-muted-foreground/80">
          Fetch place data to fill missing fields
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 min-w-38 justify-center px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => fetchTripAdvisorPlaceMutation.mutate()}
          disabled={fetchTripAdvisorPlaceMutation.isPending}
          title="Fetch TripAdvisor place data from SerpAPI"
        >
          {fetchTripAdvisorPlaceMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
          )}
          {tripAdvisorPlaceStatusQuery.data?.hasPlaceData ? "Refetch place data" : "Fetch place data"}
        </Button>
      </div>
    </div>
  );
}

