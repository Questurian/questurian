import { useState, useMemo } from "react";
import {
  usePendingTaxonomy,
  useApproveTaxonomy,
  useTaxonomyCorrections,
  useDeleteTaxonomyCorrection,
  useApprovedTaxonomy,
} from "@client/shared/services/api/hooks";
import { Button } from "@client/components/ui/button";
import { formatLocationHierarchy } from "@client/shared/lib/utils";
import { CorrectionModal } from "../components/CorrectionModal";
import { TaxonomyFilters } from "../components/TaxonomyFilters";
import { filterTaxonomyEntries } from "../utils/taxonomy-filter-utils";

export function TaxonomyReview() {
  // Pending taxonomy state
  const { data: pendingEntries, isLoading, error } = usePendingTaxonomy();
  const approveMutation = useApproveTaxonomy();
  const [processingKey, setProcessingKey] = useState<string | null>(null);

  // Corrections state
  const { data: corrections, isLoading: correctionsLoading } = useTaxonomyCorrections();
  const deleteCorrectionMutation = useDeleteTaxonomyCorrection();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Approved taxonomy state
  const { data: approvedData, isLoading: approvedLoading } = useApprovedTaxonomy();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | undefined>(undefined);
  const [defaultPartType, setDefaultPartType] = useState<"country" | "city" | "neighborhood">("city");

  // Filter state for Approved Taxonomy
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);

  // Add filtering logic with memoization
  const filteredLocations = useMemo(() => {
    if (!approvedData?.locations) return [];
    return filterTaxonomyEntries(approvedData.locations, {
      country: selectedCountry,
      city: selectedCity,
      neighborhood: selectedNeighborhood
    });
  }, [approvedData?.locations, selectedCountry, selectedCity, selectedNeighborhood]);

  // Pending taxonomy handlers
  const handleApprove = async (locationKey: string) => {
    setProcessingKey(locationKey);
    try {
      await approveMutation.mutateAsync(locationKey);
    } finally {
      setProcessingKey(null);
    }
  };

  // Correction handlers
  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteCorrectionMutation.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleQuickFill = (locationKey: string) => {
    setSelectedLocationKey(locationKey);
    setDefaultPartType("city"); // Default to city as most common case
    setModalOpen(true);
  };

  // Cascading filter handlers
  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    setSelectedCity(null);
    setSelectedNeighborhood(null);
  };

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setSelectedNeighborhood(null);
  };

  const handleNeighborhoodChange = (neighborhood: string) => {
    setSelectedNeighborhood(neighborhood);
  };

  const handleClearFilters = () => {
    setSelectedCountry(null);
    setSelectedCity(null);
    setSelectedNeighborhood(null);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      {/* SECTION 1: PENDING TAXONOMY */}
      <div data-theme="light" className="bg-background rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-[24px] font-bold mb-2 text-foreground underline">Pending Taxonomy</h2>
          <p className="text-muted-foreground">
            Review and approve new neighborhoods discovered from location data.
            Only approved neighborhoods appear in public filters.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
            <p className="font-medium">Error loading pending entries</p>
            <p className="text-sm">Please try again later.</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground"></div>
          </div>
        ) : pendingEntries && pendingEntries.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-green-500 text-6xl mb-4">✓</div>
            <p className="text-muted-foreground">
              No pending taxonomy entries. All neighborhoods are approved!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    LocationKey
                  </th>
                  <th className="px-6 py-3 text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Locations Using
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider" style={{ width: '320px' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {pendingEntries?.map((entry) => (
                  <tr key={entry.locationKey} className="hover:bg-accent">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">
                        {entry.locationKey}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {entry.locationCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 capitalize">
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <Button
                        onClick={() => handleApprove(entry.locationKey)}
                        disabled={processingKey === entry.locationKey}
                        className="bg-green-600 hover:bg-green-700 text-white border-0"
                        size="sm"
                      >
                        {processingKey === entry.locationKey && approveMutation.isPending
                          ? "Approving..."
                          : "✓ Approve"}
                      </Button>
                      <Button
                        onClick={() => handleQuickFill(entry.locationKey)}
                        variant="outline"
                        size="sm"
                        className="custom-correction-button"
                      >
                        Create Correction
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 2: TAXONOMY CORRECTIONS */}
      <div data-theme="light" className="bg-background rounded-lg shadow-lg p-6 mb-6 mt-6">
        <div className="mb-6">
          <h2 className="text-[20px] font-bold mb-2 text-foreground underline">Taxonomy Corrections</h2>
          <p className="text-muted-foreground">
            Create rules to automatically fix malformed location data from geocoding APIs.
          </p>
        </div>

        {/* Corrections Table */}
        {correctionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
          </div>
        ) : corrections && corrections.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Incorrect
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Correct
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Part Type
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {corrections.map((correction) => (
                  <tr key={correction.id} className="hover:bg-accent">
                    <td className="px-4 py-2">
                      <code className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                        {correction.incorrect_value}
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      <code className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        {correction.correct_value}
                      </code>
                    </td>
                    <td className="px-4 py-2 capitalize text-sm">
                      {correction.part_type}
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">
                      {new Date(correction.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        onClick={() => handleDelete(correction.id)}
                        disabled={deletingId === correction.id}
                        variant="destructive"
                        size="sm"
                      >
                        {deletingId === correction.id ? "Deleting..." : "Delete"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-4">
            No correction rules yet. Add one above to fix malformed location data.
          </p>
        )}
      </div>

      {/* SECTION 3: APPROVED TAXONOMY */}
      <div data-theme="light" className="bg-background rounded-lg shadow-lg p-6 mt-6">
        <div className="mb-6">
          <h2 className="text-[20px] font-bold mb-2 text-foreground underline">Approved Taxonomy</h2>
          <p className="text-muted-foreground">
            All approved location hierarchies currently available in the system.
          </p>
        </div>

        {approvedLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
          </div>
        ) : approvedData?.locations && approvedData.locations.length > 0 ? (
          <>
            {/* Add filters above the table */}
            <TaxonomyFilters
              locations={approvedData.locations}
              selectedCountry={selectedCountry}
              selectedCity={selectedCity}
              selectedNeighborhood={selectedNeighborhood}
              onCountryChange={handleCountryChange}
              onCityChange={handleCityChange}
              onNeighborhoodChange={handleNeighborhoodChange}
              onClearFilters={handleClearFilters}
            />

            {/* Show filtered count */}
            <div style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
              Showing {filteredLocations.length} of {approvedData.locations.length} entries
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      LocationKey
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-background divide-y divide-border">
                  {filteredLocations.map((location) => (
                    <tr key={location.locationKey} className="hover:bg-accent">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">
                          {location.locationKey}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Empty state when filters return no results */}
            {filteredLocations.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No taxonomy entries match the selected filters.
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-muted-foreground py-4">
            No approved taxonomy entries yet. Approve pending entries above to populate this list.
          </p>
        )}
      </div>

      {/* Correction Modal */}
      <CorrectionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        locationKey={selectedLocationKey}
        defaultPartType={defaultPartType}
      />
    </div>
  );
}
