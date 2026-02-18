import { useMemo, useState } from "react";
import { locationsApi, useLocationsBasic } from "@client/shared/services/api";
import { Button } from "@client/components/ui/button";
import { SkeletonList, ErrorAlert } from "@client/shared/components/ui";
import { LocationList } from "../components/list/LocationList";
import { LocationListEmpty } from "../components/list/LocationListEmpty";
import { LocationFilters } from "../components/filters/LocationFilters";
import { useLocationFilters } from "../hooks/useLocationFilters";
import { useLastOpenedLocation } from "../hooks/useLastOpenedLocation";
import { useCountries } from "@client/shared/hooks/useCountries";
import { buildLocationKey } from "@client/shared/lib/filter-utils";

export function Home() {
  const filters = useLocationFilters();
  const { lastOpenedId, setLastOpened } = useLastOpenedLocation();
  const { data: countries = [], isLoading: isLoadingCountries } = useCountries();
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Build locationKey from country, city, and neighborhood selections
  const locationKey = useMemo(() => {
    return buildLocationKey(
      countries,
      filters.selectedCountry,
      filters.selectedCity,
      filters.selectedNeighborhood
    );
  }, [countries, filters.selectedCountry, filters.selectedCity, filters.selectedNeighborhood]);

  // Build API params - both category and locationKey are optional
  const apiParams = {
    ...(filters.selectedCategory && { category: filters.selectedCategory }),
    ...(locationKey && { locationKey })
  };

  const { data, isLoading, error, refetch } = useLocationsBasic(apiParams);
  const allLocations = data?.locations ?? [];

  // Apply completion status filter client-side
  const filteredByStatus = useMemo(() => {
    if (filters.selectedCompletionStatus === "all") {
      return allLocations;
    }
    return allLocations.filter(location => {
      if (filters.selectedCompletionStatus === "complete") {
        return location.isComplete;
      }
      return !location.isComplete;
    });
  }, [allLocations, filters.selectedCompletionStatus]);

  // Apply search filter client-side
  const locations = useMemo(() => {
    if (!filters.searchQuery) return filteredByStatus;
    const query = filters.searchQuery.toLowerCase();
    return filteredByStatus.filter(location => {
      const title = (location.title || "").toLowerCase();
      const name = (location.name || "").toLowerCase();
      return title.includes(query) || name.includes(query);
    });
  }, [filteredByStatus, filters.searchQuery]);

  const handleDownloadAll = async () => {
    if (isDownloadingAll || locations.length === 0) return;

    setIsDownloadingAll(true);
    setDownloadError(null);

    try {
      const exports = await Promise.all(
        locations.map(async (location) => {
          const url = locationsApi.getLocationExportDownloadUrl(location.id);
          const response = await fetch(url);

          if (!response.ok) {
            throw new Error(`Failed to download export for ${location.title || location.name}`);
          }

          return response.json();
        })
      );

      const blob = new Blob([JSON.stringify(exports, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `locations-export-${timestamp}.json`;

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to download exports.";
      setDownloadError(message);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  if (error) {
    return (
      <div className="py-6">
        <ErrorAlert message={error.message} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div>
      <LocationFilters
        selectedCountry={filters.selectedCountry}
        selectedCity={filters.selectedCity}
        selectedNeighborhood={filters.selectedNeighborhood}
        selectedCategory={filters.selectedCategory}
        selectedCompletionStatus={filters.selectedCompletionStatus}
        searchQuery={filters.searchQuery}
        onCountryChange={filters.setCountry}
        onCityChange={filters.setCity}
        onNeighborhoodChange={filters.setNeighborhood}
        onCategoryChange={filters.setCategory}
        onCompletionStatusChange={filters.setCompletionStatus}
        onSearchChange={filters.setSearch}
        onReset={filters.reset}
        countries={countries}
        isLoadingCountries={isLoadingCountries}
      />

      <div className="mt-8">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2>
            {filters.isFilterActive ? "Filtered Locations" : "All Locations"} ({locations.length})
          </h2>
          <Button
            variant="outline"
            onClick={handleDownloadAll}
            disabled={isLoading || isDownloadingAll || locations.length === 0}
            title="Download location exports (location + TripAdvisor place data)"
          >
            {isDownloadingAll ? "Preparing Download..." : "Download All Exports"}
          </Button>
        </div>
        {downloadError && (
          <div className="mb-4">
            <ErrorAlert message={downloadError} />
          </div>
        )}

        {isLoading ? (
          <SkeletonList count={8} />
        ) : locations.length === 0 ? (
          <LocationListEmpty hasFilters={filters.isFilterActive} />
        ) : (
          <LocationList
            locations={locations}
            lastOpenedId={lastOpenedId}
            onExpand={setLastOpened}
          />
        )}
      </div>
    </div>
  );
}
