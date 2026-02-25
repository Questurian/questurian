import { useMemo } from "react";
import { Building2, MapPinned, CircleDot, Search, X } from "lucide-react";
import { Input } from "@client/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@client/components/ui/select";
import { cn } from "@client/shared/lib/utils";
import { CountrySelect } from "./CountrySelect";
import { CategorySelect } from "./CategorySelect";
import { extractCitiesForCountry, extractNeighborhoodsForCity } from "@client/shared/lib/filter-utils";
import type { Category, Country } from "@client/shared/services/api/types";
import type { CompletionStatus } from "../../hooks/useLocationFilters";

interface LocationFiltersProps {
  selectedCountry: string | null;
  selectedCity: string | null;
  selectedNeighborhood: string | null;
  selectedCategories: Category[];
  selectedCompletionStatus: CompletionStatus;
  searchQuery: string;
  onCountryChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onNeighborhoodChange: (value: string) => void;
  onCategoryToggle: (value: Category) => void;
  onCompletionStatusChange: (value: CompletionStatus) => void;
  onSearchChange: (value: string) => void;
  onReset: () => void;
  countries: Country[];
  isLoadingCountries: boolean;
}

const pillTrigger = cn(
  "h-auto rounded-full border px-3 py-1.5 text-xs font-medium gap-1.5",
  "transition-all duration-150",
  "border-border bg-background text-muted-foreground",
  "hover:border-primary/30 hover:text-foreground",
  "data-[has-value]:border-primary/50 data-[has-value]:bg-primary/10 data-[has-value]:text-primary",
  "focus:ring-2 focus:ring-ring focus:ring-offset-1"
);

export function LocationFilters({
  selectedCountry,
  selectedCity,
  selectedNeighborhood,
  selectedCategories,
  selectedCompletionStatus,
  searchQuery,
  onCountryChange,
  onCityChange,
  onNeighborhoodChange,
  onCategoryToggle,
  onCompletionStatusChange,
  onSearchChange,
  onReset,
  countries,
  isLoadingCountries
}: LocationFiltersProps) {
  const cities = useMemo(() => {
    if (!selectedCountry) return [];
    return extractCitiesForCountry(countries, selectedCountry);
  }, [countries, selectedCountry]);

  const neighborhoods = useMemo(() => {
    if (!selectedCountry || !selectedCity) return [];
    return extractNeighborhoodsForCity(countries, selectedCountry, selectedCity);
  }, [countries, selectedCountry, selectedCity]);

  const hasFilters =
    selectedCountry ||
    selectedCity ||
    selectedNeighborhood ||
    selectedCategories.length > 0 ||
    selectedCompletionStatus !== "all" ||
    searchQuery;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search locations..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-1.5 items-center flex-wrap">
        <CountrySelect
          value={selectedCountry}
          onChange={onCountryChange}
          countries={countries}
          isLoading={isLoadingCountries}
          triggerClassName={pillTrigger}
        />

        {selectedCountry && (
          <Select
            value={selectedCity ?? ""}
            onValueChange={onCityChange}
            disabled={cities.length === 0}
          >
            <SelectTrigger
              className={cn(pillTrigger, "w-auto")}
              data-has-value={!!selectedCity || undefined}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              {cities.map(city => (
                <SelectItem key={city.value} value={city.value}>
                  {city.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selectedCity && (
          <Select
            value={selectedNeighborhood ?? ""}
            onValueChange={onNeighborhoodChange}
            disabled={neighborhoods.length === 0}
          >
            <SelectTrigger
              className={cn(pillTrigger, "w-auto")}
              data-has-value={!!selectedNeighborhood || undefined}
            >
              <MapPinned className="h-3.5 w-3.5 shrink-0" />
              <SelectValue placeholder="Neighborhood" />
            </SelectTrigger>
            <SelectContent>
              {neighborhoods.map(n => (
                <SelectItem key={n.value} value={n.value}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={selectedCompletionStatus}
          onValueChange={(value) => onCompletionStatusChange(value as CompletionStatus)}
        >
          <SelectTrigger
            className={cn(pillTrigger, "w-auto")}
            data-has-value={selectedCompletionStatus !== "all" || undefined}
          >
            <CircleDot className="h-3.5 w-3.5 shrink-0" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <button
            type="button"
            onClick={onReset}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium",
              "border border-destructive/30 bg-destructive/5 text-destructive/80",
              "transition-all duration-150",
              "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
            )}
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      <div className="flex gap-1.5 items-center flex-wrap">
        <CategorySelect
          value={selectedCategories}
          onChange={onCategoryToggle}
          disabled={false}
        />
      </div>
    </div>
  );
}
