import { useEffect, useState } from "react";
import type {
  Category,
  LocationResponse,
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
import { RefreshCw, Loader2 } from "lucide-react";
import { DetailField } from "./DetailField";
import { useToast } from "@client/shared/hooks/useToast";
import { useUpdateLocation, locationsApi } from "@client/shared/services/api";
import { useRefetchPlaceId } from "@client/shared/services/api/hooks/useRefetchPlaceId";
import {
  useFetchTripAdvisorPlace,
  useTripAdvisorPlaceStatus,
  useDownloadTripAdvisorPlace,
} from "@client/shared/services/api/hooks/useTripAdvisorPlace";

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

  const updateLocationMutation = useUpdateLocation();

  useEffect(() => {
    if (!isOpen) return;
    setTripadvisorUrlInput(locationDetail?.tripadvisorUrl ?? "");
  }, [isOpen, locationDetail?.tripadvisorUrl]);

  const canFetchTripadvisor = Boolean(locationDetail?.tripadvisorUrl);
  const category = locationDetail?.category;
  const hasCategory = Boolean(category);

  const tripAdvisorPlaceStatusQuery = useTripAdvisorPlaceStatus({
    category: category as Category,
    locationId: locationDetail?.id || 0,
    enabled: isOpen && Boolean(locationDetail?.id) && hasCategory,
  });
  const downloadTripAdvisorPlace = useDownloadTripAdvisorPlace();

  const refetchPlaceIdMutation = useRefetchPlaceId({
    category: category as Category,
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
    category: category as Category,
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

  function handleSaveTripadvisorUrl() {
    if (!locationDetail?.id) return;
    const trimmed = tripadvisorUrlInput.trim();
    const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    if (!trimmed) {
      showToast("TripAdvisor URL is required", centerPosition);
      return;
    }

    updateLocationMutation.mutate(
      { category: locationDetail.category, id: locationDetail.id, data: { tripadvisorUrl: trimmed } },
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
                  disabled={refetchPlaceIdMutation.isPending || !hasCategory}
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
                    disabled={fetchTripAdvisorPlaceMutation.isPending || !hasCategory}
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
                      onClick={() => downloadTripAdvisorPlace.download(locationDetail.category, locationDetail.id)}
                      disabled={fetchTripAdvisorPlaceMutation.isPending || !hasCategory}
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
                  onClick={() =>
                    window.open(
                      locationsApi.getLocationExportDownloadUrl(locationDetail.category, locationDetail.id),
                      "_blank"
                    )
                  }
                  disabled={!hasCategory}
                  title="Download location data with TripAdvisor place info (no reviews)"
                >
                  Export Location
                </Button>
              </div>
            </section>
          </div>
        )}
      </DialogContent>

    </Dialog>
  );
}
