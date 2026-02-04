import { useMemo, useState } from "react";
import { locationsApi, useLocationsBasic } from "@client/shared/services/api";
import { Button } from "@client/components/ui/button";
import { LocationList, LocationListEmpty } from "../components/list";
import { LocationFilters } from "../components/filters";
import { useLocationFilters } from "../hooks/useLocationFilters";
import { useCountries } from "../hooks/useCountries";
import { buildLocationKey } from "../utils/filter-utils";

export function Home() {
  const filters = useLocationFilters();
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
  const locations = (data?.locations ?? []).map(location => ({
    ...location,
    location: location.location ?? undefined,
    category: location.category,
    categories: location.categories
  }));

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
      <div>
        <p style={{ color: "red" }}>Error: {error.message}</p>
        <button onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem" }}>

      <LocationFilters
        selectedCountry={filters.selectedCountry}
        selectedCity={filters.selectedCity}
        selectedNeighborhood={filters.selectedNeighborhood}
        selectedCategory={filters.selectedCategory}
        onCountryChange={filters.setCountry}
        onCityChange={filters.setCity}
        onNeighborhoodChange={filters.setNeighborhood}
        onCategoryChange={filters.setCategory}
        onReset={filters.reset}
        countries={countries}
        isLoadingCountries={isLoadingCountries}
      />

      <div style={{ marginTop: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "600" }}>
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
          <p style={{ color: "red", marginBottom: "1rem" }}>
            {downloadError}
          </p>
        )}

        {isLoading ? (
          <p>Loading lo1cations...</p>
        ) : locations.length === 0 ? (
          <LocationListEmpty />
        ) : (
          <LocationList locations={locations} />
        )}
      </div>
    </div>
  );
}
