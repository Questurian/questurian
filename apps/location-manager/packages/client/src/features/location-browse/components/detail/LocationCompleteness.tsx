import { useMemo, useState } from "react";
import type { LocationResponse } from "@client/shared/services/api/types";
import { CompletenessFieldEditModal } from "./completeness-field-edit/CompletenessFieldEditModal";
import { useToast } from "@client/shared/hooks/useToast";
import {
  useFetchTripAdvisorPlace,
  useTripAdvisorPlaceStatus,
} from "@client/shared/services/api/hooks/useTripAdvisorPlace";
import { LocationCompletenessSummary } from "./LocationCompletenessSummary";
import {
  getCompletenessEditField,
  getImportantOptionalCompletenessFields,
  getLocationCompletenessFields,
  type CompletenessField,
} from "./location-completeness-fields";

interface LocationCompletenessProps {
  locationDetail: LocationResponse;
}

export function LocationCompleteness({ locationDetail }: LocationCompletenessProps) {
  const { showToast } = useToast();
  const requiredFields = useMemo(
    () => getLocationCompletenessFields(locationDetail),
    [locationDetail]
  );
  const importantOptionalFields = useMemo(
    () => getImportantOptionalCompletenessFields(locationDetail),
    [locationDetail]
  );

  const missingImportantOptionalFields = useMemo(
    () => importantOptionalFields.filter((field) => !field.present),
    [importantOptionalFields]
  );

  const missingFields = useMemo(
    () => requiredFields.filter((field) => !field.present),
    [requiredFields]
  );
  const isComplete = missingFields.length === 0;
  const hasTripadvisorUrl = Boolean(locationDetail.tripadvisorUrl?.trim());
  const shouldShowTripAdvisorButton = hasTripadvisorUrl;

  const [completenessExpanded, setCompletenessExpanded] = useState<boolean | undefined>(undefined);
  const isCompletenessExpanded = completenessExpanded ?? !isComplete;
  const [editField, setEditField] = useState<CompletenessField | null>(null);

  const tripAdvisorPlaceStatusQuery = useTripAdvisorPlaceStatus({
    category: locationDetail.category,
    locationId: locationDetail.id,
    enabled: shouldShowTripAdvisorButton,
  });
  const fetchTripAdvisorPlaceMutation = useFetchTripAdvisorPlace({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: (data) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(data.message, centerPosition);
    },
    onError: (error) => {
      const centerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      showToast(error.message || "Failed to fetch TripAdvisor place data", centerPosition);
    },
  });

  const handleEditField = (field: CompletenessField) => {
    setEditField(getCompletenessEditField(field));
  };

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <LocationCompletenessSummary
        requiredFields={requiredFields}
        importantOptionalFields={importantOptionalFields}
        missingFields={missingFields}
        missingImportantOptionalFields={missingImportantOptionalFields}
        isComplete={isComplete}
        isExpanded={isCompletenessExpanded}
        shouldShowTripAdvisorButton={shouldShowTripAdvisorButton}
        hasTripAdvisorPlaceData={Boolean(tripAdvisorPlaceStatusQuery.data?.hasPlaceData)}
        isFetchingTripAdvisorPlace={fetchTripAdvisorPlaceMutation.isPending}
        onEditField={handleEditField}
        onFetchTripAdvisorPlace={() => fetchTripAdvisorPlaceMutation.mutate()}
        onToggleExpanded={() => setCompletenessExpanded(!isCompletenessExpanded)}
      />

      {editField && (
        <CompletenessFieldEditModal
          field={editField}
          locationDetail={locationDetail}
          open={Boolean(editField)}
          onOpenChange={(open) => !open && setEditField(null)}
        />
      )}
    </div>
  );
}
