import { useEffect, useState } from "react";
import { useUpdateLocation } from "@client/shared/services/api/hooks";
import type { LocationResponse } from "@client/shared/services/api/types";
import { TourSelector } from "./TourSelector";

interface AttractionToursManagerProps {
  locationDetail: LocationResponse;
}

function normalizeTourIds(ids: number[] | null | undefined): number[] {
  if (!Array.isArray(ids)) return [];
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
}

export function AttractionToursManager({ locationDetail }: AttractionToursManagerProps) {
  const updateLocationMutation = useUpdateLocation();
  const [selectedTourIds, setSelectedTourIds] = useState(() =>
    normalizeTourIds(locationDetail.tourIds)
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTourIds(normalizeTourIds(locationDetail.tourIds));
  }, [locationDetail.id, locationDetail.tourIds]);

  function persistTourIds(nextIds: number[]) {
    const previousIds = selectedTourIds;
    setSelectedTourIds(nextIds);
    setSaveError(null);

    updateLocationMutation.mutate(
      {
        category: locationDetail.category,
        id: locationDetail.id,
        data: { tourIds: nextIds },
      },
      {
        onError: (error) => {
          setSelectedTourIds(previousIds);
          setSaveError(error.message || "Failed to save tours");
        },
      }
    );
  }

  return (
    <TourSelector
      selectedTourIds={selectedTourIds}
      onChange={persistTourIds}
      isSaving={updateLocationMutation.isPending}
      error={saveError}
    />
  );
}
