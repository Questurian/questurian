import { useCallback, useEffect, useState } from "react";
import type { LocationResponse } from "@client/shared/services/api/types";
import { useGenerateNeighborhoodDescription } from "@client/shared/services/api/hooks/useGenerateNeighborhoodDescription";
import { useLocationTypes } from "@client/shared/services/api/hooks/useLocationTypes";
import { useToast } from "@client/shared/hooks/useToast";
import { formatLocationHierarchy } from "@client/shared/lib/utils";
import {
  getNightlifeFieldDraftValue,
  isNightlifeFieldKey,
  isNightlifeMultiFieldKey,
  type NightlifeFieldKey,
} from "@client/shared/lib/nightlife-details";
import { getIdealForGroups } from "@shared/types/location-ideal-for";
import { CUISINE_OPTION_GROUPS, CUISINE_OPTIONS } from "@client/shared/constants/cuisine-options";
import type { FieldDef } from "../completeness-field-edit.types";
import { getInitialValue } from "../field-value-utils";
import {
  createClosedDayEntries,
  parseOperationHoursJson,
  type DayEntry,
} from "../operation-hours/operation-hours-utils";

interface UseCompletenessFieldDraftProps {
  field: FieldDef;
  locationDetail: LocationResponse;
  open: boolean;
}

export function useCompletenessFieldDraft({
  field,
  locationDetail,
  open,
}: UseCompletenessFieldDraftProps) {
  const { showToast } = useToast();
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes(
    field.key === "type" ? locationDetail.category : undefined
  );
  const [value, setValue] = useState("");
  const [idealForDraft, setIdealForDraft] = useState<string[]>([]);
  const [cuisinesDraft, setCuisinesDraft] = useState<string[]>([]);
  const [nightlifeMultiDraft, setNightlifeMultiDraft] = useState<string[]>([]);
  const [taxonomyLocationKey, setTaxonomyLocationKey] = useState("");
  const [taxonomyDistrict, setTaxonomyDistrict] = useState("");
  const [coordinateDraft, setCoordinateDraft] = useState({ lat: "", lng: "" });
  const [dayEntries, setDayEntries] = useState<DayEntry[]>(createClosedDayEntries);

  const getInitialNightlifeValue = useCallback(
    (fieldKey: NightlifeFieldKey): string | string[] => {
      const draft = getNightlifeFieldDraftValue(locationDetail.nightlifeDetails, fieldKey);
      if (fieldKey === "nightlife.clubType" && typeof draft === "string" && !draft.trim()) {
        return locationDetail.type?.trim() ?? "";
      }
      if (fieldKey === "nightlife.priceTier" && typeof draft === "string" && !draft.trim()) {
        return locationDetail.priceLevel?.trim() ?? "";
      }
      return draft;
    },
    [locationDetail.nightlifeDetails, locationDetail.priceLevel, locationDetail.type]
  );

  useEffect(() => {
    if (!open) return;
    setValue(getInitialValue(field, locationDetail));
    setCoordinateDraft({
      lat: locationDetail.coordinates?.lat != null ? String(locationDetail.coordinates.lat) : "",
      lng: locationDetail.coordinates?.lng != null ? String(locationDetail.coordinates.lng) : "",
    });
  }, [open, field, locationDetail]);

  useEffect(() => {
    if (!open || !isNightlifeFieldKey(field.key)) return;
    const draft = getInitialNightlifeValue(field.key);
    if (isNightlifeMultiFieldKey(field.key)) {
      setNightlifeMultiDraft(Array.isArray(draft) ? draft : []);
    } else {
      setValue(typeof draft === "string" ? draft : "");
    }
  }, [open, field, getInitialNightlifeValue]);

  useEffect(() => {
    if (!open) return;
    if (field.key === "idealFor") {
      setIdealForDraft(Array.isArray(locationDetail.idealFor) ? locationDetail.idealFor : []);
    }
    if (field.key === "cuisines") {
      setCuisinesDraft(
        Array.isArray(locationDetail.tripadvisorCuisines)
          ? locationDetail.tripadvisorCuisines
          : []
      );
    }
    if (field.key === "operationHours") {
      setDayEntries(parseOperationHoursJson(getInitialValue(field, locationDetail)));
    }
    if (field.key === "locationKey" || field.key === "district") {
      setTaxonomyLocationKey(locationDetail.locationKey?.trim() ?? "");
      setTaxonomyDistrict(locationDetail.district?.trim() ?? "");
    }
  }, [open, field, locationDetail]);

  const {
    mutate: generateNeighborhoodDescription,
    isPending: isGeneratingNeighborhoodDescription,
  } = useGenerateNeighborhoodDescription({
    category: locationDetail.category,
    locationId: locationDetail.id,
    onSuccess: (data) => {
      setValue(data.description);
      showToast(
        data.source === "fallback"
          ? "AI was slow, so a contextual draft was generated. Review it and save when you're done."
          : "AI draft ready. Review it and save when you're done.",
        getCenterPosition()
      );
    },
    onError: (error) => {
      showToast(error.message || "Failed to generate neighborhood description", getCenterPosition());
    },
  });

  const copyText = async (text: string, label: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      showToast(`${label} is empty`, getCenterPosition());
      return;
    }
    try {
      await navigator.clipboard.writeText(trimmed);
      showToast(`${label} copied`, getCenterPosition());
    } catch {
      showToast("Failed to copy value", getCenterPosition());
    }
  };

  const addIdealForTag = (tag: string) => {
    setIdealForDraft((previous) =>
      previous.includes(tag) || previous.length >= 4 ? previous : [...previous, tag]
    );
  };
  const removeIdealForTag = (tag: string) => {
    setIdealForDraft((previous) => previous.filter((item) => item !== tag));
  };

  return {
    value, setValue,
    idealForDraft, addIdealForTag, removeIdealForTag,
    cuisinesDraft, setCuisinesDraft,
    nightlifeMultiDraft, setNightlifeMultiDraft,
    taxonomyLocationKey, setTaxonomyLocationKey,
    taxonomyDistrict, setTaxonomyDistrict,
    coordinateDraft, setCoordinateDraft,
    dayEntries, setDayEntries,
    locationTypes, isLoadingTypes,
    copyText,
    generateNeighborhoodDescription,
    isGeneratingNeighborhoodDescription,
    canGenerateNeighborhoodDescription: Boolean(
      locationDetail.district?.trim() || locationDetail.locationKey?.split("|")[2]?.trim()
    ),
    locationHierarchyLabel: locationDetail.locationKey?.trim()
      ? formatLocationHierarchy(locationDetail.locationKey.trim())
      : null,
    availableIdealForGroups: getIdealForGroups(locationDetail.category)
      .map((group) => ({ ...group, tags: group.tags.filter((tag) => !idealForDraft.includes(tag)) }))
      .filter((group) => group.tags.length > 0),
    availableCuisineOptions: CUISINE_OPTIONS.filter((option) => !cuisinesDraft.includes(option)),
    availableCuisineGroups: CUISINE_OPTION_GROUPS
      .map((group) => ({ ...group, options: group.options.filter((option) => !cuisinesDraft.includes(option)) }))
      .filter((group) => group.options.length > 0),
  };
}

function getCenterPosition() {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}
