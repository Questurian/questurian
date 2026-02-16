import { useMemo } from "react";
import { Search } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@client/components/ui/select";
import { CountrySelect } from "./CountrySelect";
import { CategorySelect } from "./CategorySelect";
import { extractCitiesForCountry, extractNeighborhoodsForCity } from "@client/shared/lib/filter-utils";
import type { Category, Country } from "@client/shared/services/api/types";
import type { CompletionStatus } from "../../hooks/useLocationFilters";

interface LocationFiltersProps {
  selectedCountry: string | null;
  selectedCity: string | null;
  selectedNeighborhood: string | null;
  selectedCategory: Category | null;
  selectedCompletionStatus: CompletionStatus;
  searchQuery: string;
  onCountryChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onNeighborhoodChange: (value: string) => void;
  onCategoryChange: (value: Category) => void;
  onCompletionStatusChange: (value: CompletionStatus) => void;
  onSearchChange: (value: string) => void;
  onReset: () => void;
  countries: Country[];
  isLoadingCountries: boolean;
}

export function LocationFilters({
  selectedCountry,
  selectedCity,
  selectedNeighborhood,
  selectedCategory,
  selectedCompletionStatus,
  searchQuery,
  onCountryChange,
  onCityChange,
  onNeighborhoodChange,
  onCategoryChange,
  onCompletionStatusChange,
  onSearchChange,
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

  const hasFilters = selectedCountry || selectedCity || selectedNeighborhood || selectedCategory || selectedCompletionStatus !== "all" || searchQuery;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search locations..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Country</label>
          <CountrySelect
            value={selectedCountry}
            onChange={onCountryChange}
            countries={countries}
            isLoading={isLoadingCountries}
          />
        </div>

        {/* City Select - only show after country is selected */}
        {selectedCountry && (
          <div>
            <label className="block text-xs font-medium mb-1.5 text-muted-foreground">City</label>
            <Select
              value={selectedCity ?? ""}
              onValueChange={onCityChange}
              disabled={cities.length === 0}
            >
              <SelectTrigger className="w-[200px]">
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
            <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Neighborhood</label>
            <Select
              value={selectedNeighborhood ?? ""}
              onValueChange={onNeighborhoodChange}
              disabled={neighborhoods.length === 0}
            >
              <SelectTrigger className="w-[200px]">
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

        <div>
          <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Category</label>
          <CategorySelect
            value={selectedCategory}
            onChange={onCategoryChange}
            disabled={false}
          />
        </div>

        {/* Completion Status Select */}
        <div>
          <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Status</label>
          <Select
            value={selectedCompletionStatus}
            onValueChange={(value) => onCompletionStatusChange(value as CompletionStatus)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="incomplete">Incomplete</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <Button
            variant="outline"
            onClick={onReset}
          >
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}
