import { Button } from "@client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui/select";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ListFilter,
  RefreshCw,
  Rocket,
  XCircle,
} from "lucide-react";
import type { Category } from "@client/shared/services/api/types";
import {
  UNSPECIFIED_CITY_FILTER,
  UNSPECIFIED_COUNTRY_FILTER,
  UNSPECIFIED_NEIGHBORHOOD_FILTER,
  UNSPECIFIED_TYPE_FILTER,
  type CityFilter,
  type CountryFilter,
  type LocationTypeFilter,
  type NeighborhoodFilter,
  type StatusFilter,
} from "@client/features/admin/hooks/usePayloadSyncFilters";
import type { PayloadSyncFilterOptions } from "@client/features/admin/utils/payload-sync-filter-utils";

interface PayloadSyncFiltersProps {
  activeLocationScopeLabel: string;
  categoryFilter: Category | "all";
  cityFilter: CityFilter;
  cityOptions: PayloadSyncFilterOptions;
  clearFilters: () => void;
  countryFilter: CountryFilter;
  countryOptions: PayloadSyncFilterOptions;
  filteredCount: number;
  hasActiveFilters: boolean;
  isCityFilterEnabled: boolean;
  isNeighborhoodFilterEnabled: boolean;
  locationTypeFilter: LocationTypeFilter;
  locationTypeOptions: PayloadSyncFilterOptions;
  neighborhoodFilter: NeighborhoodFilter;
  neighborhoodOptions: PayloadSyncFilterOptions;
  setCategoryFilter: (value: Category | "all") => void;
  setCityFilter: (value: CityFilter) => void;
  setCountryFilter: (value: CountryFilter) => void;
  setLocationTypeFilter: (value: LocationTypeFilter) => void;
  setNeighborhoodFilter: (value: NeighborhoodFilter) => void;
  setStatusFilter: (value: StatusFilter) => void;
  statusFilter: StatusFilter;
}

export function PayloadSyncFilters({
  activeLocationScopeLabel,
  categoryFilter,
  cityFilter,
  cityOptions,
  clearFilters,
  countryFilter,
  countryOptions,
  filteredCount,
  hasActiveFilters,
  isCityFilterEnabled,
  isNeighborhoodFilterEnabled,
  locationTypeFilter,
  locationTypeOptions,
  neighborhoodFilter,
  neighborhoodOptions,
  setCategoryFilter,
  setCityFilter,
  setCountryFilter,
  setLocationTypeFilter,
  setNeighborhoodFilter,
  setStatusFilter,
  statusFilter,
}: PayloadSyncFiltersProps) {
  return (
    <div className="mb-6 space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-[220px]">
          <label className="block text-sm font-medium mb-1">Status</label>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all"><span className="inline-flex items-center gap-2"><ListFilter className="h-4 w-4" />All Statuses</span></SelectItem>
              <SelectItem value="synced"><span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" />Synced</span></SelectItem>
              <SelectItem value="ready"><span className="inline-flex items-center gap-2"><Rocket className="h-4 w-4 text-blue-500" />Ready for Sync (Complete Fields)</span></SelectItem>
              <SelectItem value="incomplete"><span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Incomplete (Missing Fields)</span></SelectItem>
              <SelectItem value="needs_resync"><span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 text-orange-500" />Needs Resync</span></SelectItem>
              <SelectItem value="failed"><span className="inline-flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" />Failed</span></SelectItem>
              <SelectItem value="unsupported"><span className="inline-flex items-center gap-2"><Ban className="h-4 w-4 text-muted-foreground" />Unsupported Category</span></SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[220px]">
          <label className="block text-sm font-medium mb-1">Category</label>
          <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as Category | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="dining">Dining</SelectItem>
              <SelectItem value="accommodations">Accommodations</SelectItem>
              <SelectItem value="attractions">Attractions</SelectItem>
              <SelectItem value="nightlife">Nightlife</SelectItem>
              <SelectItem value="key_locations">Key Locations</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[220px]">
          <label className="block text-sm font-medium mb-1">Location Type</label>
          <Select value={locationTypeFilter} onValueChange={(value) => setLocationTypeFilter(value as LocationTypeFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by location type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {locationTypeOptions.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label} ({option.count})</SelectItem>
              ))}
              {locationTypeOptions.unspecifiedCount > 0 && (
                <SelectItem value={UNSPECIFIED_TYPE_FILTER}>Unspecified ({locationTypeOptions.unspecifiedCount})</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Location Scope</p>
            <p className="text-sm text-muted-foreground">Drill from country to city to neighborhood.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">{filteredCount} in view</span>
            <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs text-foreground">{activeLocationScopeLabel}</span>
            {hasActiveFilters && <Button variant="outline" size="sm" onClick={clearFilters}>Clear Filters</Button>}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="min-w-[220px]">
            <label className="block text-sm font-medium mb-1">Country</label>
            <Select
              value={countryFilter}
              onValueChange={(value) => {
                setCountryFilter(value as CountryFilter);
                setCityFilter("all");
                setNeighborhoodFilter("all");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countryOptions.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label} ({option.count})</SelectItem>
                ))}
                {countryOptions.unspecifiedCount > 0 && (
                  <SelectItem value={UNSPECIFIED_COUNTRY_FILTER}>Unspecified ({countryOptions.unspecifiedCount})</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[220px]">
            <label className="block text-sm font-medium mb-1">City</label>
            <Select
              value={cityFilter}
              onValueChange={(value) => {
                setCityFilter(value as CityFilter);
                setNeighborhoodFilter("all");
              }}
              disabled={!isCityFilterEnabled || (cityOptions.options.length === 0 && cityOptions.unspecifiedCount === 0)}
            >
              <SelectTrigger>
                <SelectValue placeholder={!isCityFilterEnabled ? "Select country first" : "All cities"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cityOptions.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label} ({option.count})</SelectItem>
                ))}
                {cityOptions.unspecifiedCount > 0 && (
                  <SelectItem value={UNSPECIFIED_CITY_FILTER}>Unspecified ({cityOptions.unspecifiedCount})</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[220px]">
            <label className="block text-sm font-medium mb-1">Neighborhood</label>
            <Select
              value={neighborhoodFilter}
              onValueChange={(value) => setNeighborhoodFilter(value as NeighborhoodFilter)}
              disabled={!isNeighborhoodFilterEnabled || (neighborhoodOptions.options.length === 0 && neighborhoodOptions.unspecifiedCount === 0)}
            >
              <SelectTrigger>
                <SelectValue placeholder={!isNeighborhoodFilterEnabled ? "Select city first" : "All neighborhoods"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Neighborhoods</SelectItem>
                {neighborhoodOptions.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label} ({option.count})</SelectItem>
                ))}
                {neighborhoodOptions.unspecifiedCount > 0 && (
                  <SelectItem value={UNSPECIFIED_NEIGHBORHOOD_FILTER}>Unspecified ({neighborhoodOptions.unspecifiedCount})</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
