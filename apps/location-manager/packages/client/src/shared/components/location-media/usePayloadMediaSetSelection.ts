import { useEffect, useMemo, useState } from "react";
import { useToast } from "@client/shared/hooks/useToast";
import { usePayloadMediaSets } from "@client/shared/services/api/hooks";
import { useUpdateLocation } from "@client/shared/services/api/hooks/useUpdateLocation";
import type {
  LocationResponse,
  PayloadMediaSetItem,
} from "@client/shared/services/api/types";

export const MAX_ATTRACTION_GALLERY_ITEMS = 20;

function normalizeSelectedIds(ids: string[] | null | undefined): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  return Array.from(
    new Set(
      ids
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );
}

export function usePayloadMediaSetSelection(locationDetail: LocationResponse) {
  const { showToast } = useToast();
  const updateLocationMutation = useUpdateLocation();
  const [selectedIds, setSelectedIds] = useState(() =>
    normalizeSelectedIds(locationDetail.selectedPayloadMediaSetIds)
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIds(normalizeSelectedIds(locationDetail.selectedPayloadMediaSetIds));
  }, [locationDetail.id, locationDetail.selectedPayloadMediaSetIds]);

  const uploadCount = locationDetail.uploads?.length ?? 0;
  const availableSelectionSlots = Math.max(0, MAX_ATTRACTION_GALLERY_ITEMS - uploadCount);
  const isAtCapacity = selectedIds.length >= availableSelectionSlots;

  const selectedMediaSetsQuery = usePayloadMediaSets({
    ids: selectedIds,
    limit: Math.max(selectedIds.length, 1),
    enabled: selectedIds.length > 0,
  });

  const selectedMediaSetsById = useMemo(
    () =>
      new Map(
        (selectedMediaSetsQuery.data?.mediaSets ?? []).map((item) => [item.id, item])
      ),
    [selectedMediaSetsQuery.data?.mediaSets]
  );

  const selectedMediaSets = useMemo(
    () =>
      selectedIds
        .map((id) => selectedMediaSetsById.get(id))
        .filter((item): item is PayloadMediaSetItem => Boolean(item)),
    [selectedIds, selectedMediaSetsById]
  );

  function persistSelectedIds(nextIds: string[]) {
    const previousIds = selectedIds;
    setSelectedIds(nextIds);
    setSaveError(null);

    updateLocationMutation.mutate(
      {
        category: locationDetail.category,
        id: locationDetail.id,
        data: {
          selectedPayloadMediaSetIds: nextIds.length > 0 ? nextIds : null,
        },
      },
      {
        onError: (error) => {
          setSelectedIds(previousIds);
          setSaveError(error.message || "Failed to save Payload photo selection");
          showToast(
            error.message || "Failed to save Payload photo selection",
            { x: window.innerWidth / 2, y: window.innerHeight / 2 }
          );
        },
      }
    );
  }

  function handleToggle(item: PayloadMediaSetItem) {
    if (updateLocationMutation.isPending) {
      return;
    }

    const existingIndex = selectedIds.indexOf(item.id);
    if (existingIndex >= 0) {
      persistSelectedIds(selectedIds.filter((id) => id !== item.id));
      return;
    }

    if (selectedIds.length >= availableSelectionSlots) {
      const message =
        availableSelectionSlots === 0
          ? "Uploads already use all 20 gallery slots."
          : `Only ${availableSelectionSlots} Payload photo${availableSelectionSlots === 1 ? "" : "s"} can be selected for this attraction.`;
      setSaveError(message);
      return;
    }

    persistSelectedIds([...selectedIds, item.id]);
  }

  return {
    selectedIds,
    selectedMediaSets,
    handleToggle,
    availableSelectionSlots,
    isAtCapacity,
    isPending: updateLocationMutation.isPending,
    saveError,
    setSaveError,
  };
}

export type PayloadMediaSetSelection = ReturnType<typeof usePayloadMediaSetSelection>;
