import { useMemo } from "react";
import { Button } from "@client/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@client/components/ui/select";
import {
  extractCountries,
  extractCitiesForCountry,
  extractNeighborhoodsForCity
} from "../utils/taxonomy-filter-utils";
import type { LocationHierarchyItem } from "@client/shared/services/api/types";

interface TaxonomyFiltersProps {
  locations: LocationHierarchyItem[];
  selectedCountry: string | null;
  selectedCity: string | null;
  selectedNeighborhood: string | null;
  onCountryChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onNeighborhoodChange: (value: string) => void;
  onClearFilters: () => void;
}

export function TaxonomyFilters({
  locations,
  selectedCountry,
  selectedCity,
  selectedNeighborhood,
  onCountryChange,
  onCityChange,
  onNeighborhoodChange,
  onClearFilters
}: TaxonomyFiltersProps) {
  // Extract filter options with memoization
  const countries = useMemo(() => extractCountries(locations), [locations]);

  const cities = useMemo(() => {
    if (!selectedCountry) return [];
    return extractCitiesForCountry(locations, selectedCountry);
  }, [locations, selectedCountry]);

  const neighborhoods = useMemo(() => {
    if (!selectedCountry || !selectedCity) return [];
    return extractNeighborhoodsForCity(locations, selectedCountry, selectedCity);
  }, [locations, selectedCountry, selectedCity]);

  const hasActiveFilters = selectedCountry || selectedCity || selectedNeighborhood;

  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "1rem" }}>
      {/* Country Filter */}
      <div>
        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.5rem", color: "var(--muted-foreground)" }}>
          Country
        </label>
        <Select value={selectedCountry ?? ""} onValueChange={onCountryChange}>
          <SelectTrigger style={{ width: "200px" }}>
            <SelectValue placeholder="All countries" />
          </SelectTrigger>
          <SelectContent>
            {countries.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label} ({option.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* City Filter */}
      <div>
        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.5rem", color: "var(--muted-foreground)" }}>
          City
        </label>
        <Select
          value={selectedCity ?? ""}
          onValueChange={onCityChange}
          disabled={!selectedCountry || cities.length === 0}
        >
          <SelectTrigger style={{ width: "200px" }}>
            <SelectValue placeholder={!selectedCountry ? "Select country first" : "All cities"} />
          </SelectTrigger>
          <SelectContent>
            {cities.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label} ({option.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Neighborhood Filter */}
      <div>
        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.5rem", color: "var(--muted-foreground)" }}>
          District/Neighborhood
        </label>
        <Select
          value={selectedNeighborhood ?? ""}
          onValueChange={onNeighborhoodChange}
          disabled={!selectedCity || neighborhoods.length === 0}
        >
          <SelectTrigger style={{ width: "200px" }}>
            <SelectValue placeholder={!selectedCity ? "Select city first" : "All neighborhoods"} />
          </SelectTrigger>
          <SelectContent>
            {neighborhoods.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label} ({option.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clear Filters Button */}
      <Button
        variant="outline"
        onClick={onClearFilters}
        disabled={!hasActiveFilters}
        style={{ marginLeft: "auto" }}
      >
        Clear All Filters
      </Button>
    </div>
  );
}
