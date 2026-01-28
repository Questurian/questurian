import { useMemo } from "react";
import { Button } from "@client/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@client/components/ui/select";
import { CountrySelect } from "./CountrySelect";
import { CategorySelect } from "./CategorySelect";
import { extractCitiesForCountry, extractNeighborhoodsForCity } from "../../utils/filter-utils";
import type { Category, Country } from "@client/shared/services/api/types";

interface LocationFiltersProps {
  selectedCountry: string | null;
  selectedCity: string | null;
  selectedNeighborhood: string | null;
  selectedCategory: Category | null;
  onCountryChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onNeighborhoodChange: (value: string) => void;
  onCategoryChange: (value: Category) => void;
  onReset: () => void;
  countries: Country[];
  isLoadingCountries: boolean;
}

export function LocationFilters({
  selectedCountry,
  selectedCity,
  selectedNeighborhood,
  selectedCategory,
  onCountryChange,
  onCityChange,
  onNeighborhoodChange,
  onCategoryChange,
  onReset,
  countries,
  isLoadingCountries
}: LocationFiltersProps) {
  // Extract cities and neighborhoods using filter utilities
  const cities = useMemo(() => {
    if (!selectedCountry) return [];
    return extractCitiesForCountry(countries, selectedCountry);
  }, [countries, selectedCountry]);

  const neighborhoods = useMemo(() => {
    if (!selectedCountry || !selectedCity) return [];
    return extractNeighborhoodsForCity(countries, selectedCountry, selectedCity);
  }, [countries, selectedCountry, selectedCity]);

  const hasFilters = selectedCountry || selectedCity || selectedNeighborhood || selectedCategory;

  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "1rem" }}>
      <CountrySelect
        value={selectedCountry}
        onChange={onCountryChange}
        countries={countries}
        isLoading={isLoadingCountries}
      />

      {/* City Select - only show after country is selected */}
      {selectedCountry && (
        <div>
          <Select
            value={selectedCity ?? ""}
            onValueChange={onCityChange}
            disabled={cities.length === 0}
          >
            <SelectTrigger style={{ width: "200px" }}>
              <SelectValue placeholder="All cities" />
            </SelectTrigger>
            <SelectContent>
              {cities.map(city => (
                <SelectItem key={city.value} value={city.value}>
                  {city.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Neighborhood Select - only show after city is selected */}
      {selectedCity && (
        <div>
          <Select
            value={selectedNeighborhood ?? ""}
            onValueChange={onNeighborhoodChange}
            disabled={neighborhoods.length === 0}
          >
            <SelectTrigger style={{ width: "200px" }}>
              <SelectValue placeholder="All neighborhoods" />
            </SelectTrigger>
            <SelectContent>
              {neighborhoods.map(n => (
                <SelectItem key={n.value} value={n.value}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <CategorySelect
        value={selectedCategory}
        onChange={onCategoryChange}
        disabled={false} // Category can be selected independently of country
      />

      {hasFilters && (
        <Button
          variant="outline"
          onClick={onReset}
        >
          Clear Filters
        </Button>
      )}
    </div>
  );
}
