import { useMemo } from "react";
import { useLocationsBasic } from "@client/shared/services/api";
import { LocationList, LocationListEmpty } from "../components/list";
import { LocationFilters } from "../components/filters";
import { useLocationFilters } from "../hooks/useLocationFilters";
import { useCountries } from "../hooks/useCountries";
import { buildLocationKey } from "../utils/filter-utils";

export function Home() {
  const filters = useLocationFilters();
  const { data: countries = [], isLoading: isLoadingCountries } = useCountries();

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
    category: location.category
  }));

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
        <h2 style={{ marginBottom: "1rem", fontSize: "1.25rem", fontWeight: "600" }}>
          {filters.isFilterActive ? "Filtered Locations" : "All Locations"} ({locations.length})
        </h2>

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