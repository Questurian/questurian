import type { LocationResponse, UpdateMapsRequest } from "@client/shared/services/api/types";
import { useUpdateLocation } from "@client/shared/services/api/hooks/useUpdateLocation";
import { useToast } from "@client/shared/hooks/useToast";
import { isValidLocationKey } from "@client/shared/lib/taxonomy-location";
import {
  buildNightlifeFieldUpdatePayload,
  isNightlifeFieldKey,
  isNightlifeMultiFieldKey,
} from "@client/shared/lib/nightlife-details";
import type { FieldDef } from "../completeness-field-edit.types";
import type { useCompletenessFieldDraft } from "../drafts/use-completeness-field-draft";
import { parseCoordinateInput } from "../field-value-utils";
import { buildOperationHoursJson } from "../operation-hours/operation-hours-utils";
import { buildFieldUpdatePayload } from "./build-field-update-payload";

interface UseSaveCompletenessFieldProps {
  field: FieldDef;
  locationDetail: LocationResponse;
  draft: ReturnType<typeof useCompletenessFieldDraft>;
  onClose: () => void;
}

export function useSaveCompletenessField({
  field,
  locationDetail,
  draft,
  onClose,
}: UseSaveCompletenessFieldProps) {
  const { showToast } = useToast();
  const { mutate: updateLocation, isPending } = useUpdateLocation();

  const save = (data: UpdateMapsRequest, successMessage: string, errorMessage: string) => {
    updateLocation(
      { category: locationDetail.category, id: locationDetail.id, data },
      {
        onSuccess: () => {
          showToast(successMessage, getCenterPosition());
          onClose();
        },
        onError: (error) => showToast(error.message || errorMessage, getCenterPosition()),
      }
    );
  };

  const handleSave = () => {
    if (field.key === "media") {
      onClose();
      return;
    }
    if (field.key === "operationHours") {
      save({ operationHours: buildOperationHoursJson(draft.dayEntries) }, "Hours saved", "Failed to save hours");
      return;
    }
    if (field.key === "coordinates") {
      const lat = parseCoordinateInput(draft.coordinateDraft.lat);
      const lng = parseCoordinateInput(draft.coordinateDraft.lng);
      if (lat == null || lng == null) return showValidationError("Latitude and longitude are required");
      if (lat < -90 || lat > 90) return showValidationError("Latitude must be between -90 and 90");
      if (lng < -180 || lng > 180) return showValidationError("Longitude must be between -180 and 180");
      save({ lat, lng }, "Coordinates saved", "Failed to save coordinates");
      return;
    }
    if (field.key === "contactUrl") {
      const name = locationDetail.source?.name?.trim();
      const address = locationDetail.source?.address?.trim();
      if (!name || !address) {
        return showValidationError("Name and Source Address are required to generate Google URL");
      }
      save({ name, address }, "Google URL regenerated", "Failed to regenerate Google URL");
      return;
    }
    if (field.key === "idealFor") {
      if (!draft.idealForDraft.length) return showValidationError("Select at least one Ideal For tag");
      save({ idealFor: draft.idealForDraft }, "Ideal For saved", "Failed to save Ideal For");
      return;
    }
    if (field.key === "locationKey" || field.key === "district") {
      const locationKey = draft.taxonomyLocationKey.trim();
      if (locationKey && !isValidLocationKey(locationKey)) {
        return showValidationError("Location Key must be lowercase kebab-case (country|city|neighborhood)");
      }
      save(
        {
          locationKey: locationKey || undefined,
          district: draft.taxonomyDistrict.trim() || null,
          autoApproveTaxonomy: true,
        },
        "Location taxonomy saved",
        "Failed to save location taxonomy"
      );
      return;
    }
    if (isNightlifeFieldKey(field.key)) {
      const value = isNightlifeMultiFieldKey(field.key) ? draft.nightlifeMultiDraft : draft.value;
      if (Array.isArray(value) ? !value.length : !value.trim()) {
        return showValidationError(
          isNightlifeMultiFieldKey(field.key)
            ? `Select at least one ${field.label.toLowerCase()} option`
            : `Select an option for ${field.label.toLowerCase()}`
        );
      }
      save(
        buildNightlifeFieldUpdatePayload(locationDetail.nightlifeDetails, field.key, value),
        `${field.label} saved`,
        `Failed to save ${field.label}`
      );
      return;
    }
    if (field.key === "cuisines") {
      save(
        { tripadvisorCuisines: draft.cuisinesDraft.length ? draft.cuisinesDraft : null },
        "Cuisines saved",
        "Failed to save cuisines"
      );
      return;
    }
    const payload = buildFieldUpdatePayload(field.key, draft.value);
    if (payload) save(payload, `${field.label} saved`, `Failed to save ${field.label}`);
  };

  const payload = buildFieldUpdatePayload(field.key, draft.value);
  const lat = parseCoordinateInput(draft.coordinateDraft.lat);
  const lng = parseCoordinateInput(draft.coordinateDraft.lng);
  const hasValidCoordinates = lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const canSave = (() => {
    if (field.key === "media" || field.key === "cuisines" || field.key === "operationHours") return true;
    if (field.key === "contactUrl") return Boolean(locationDetail.source?.name?.trim() && locationDetail.source?.address?.trim());
    if (isNightlifeFieldKey(field.key)) return isNightlifeMultiFieldKey(field.key) ? draft.nightlifeMultiDraft.length > 0 : draft.value.trim().length > 0;
    if (field.key === "coordinates") return hasValidCoordinates;
    if (field.key === "locationKey" || field.key === "district") return !draft.taxonomyLocationKey.trim() || isValidLocationKey(draft.taxonomyLocationKey.trim());
    if (field.key === "idealFor") return draft.idealForDraft.length > 0;
    return payload !== null;
  })();

  function showValidationError(message: string) {
    showToast(message, getCenterPosition());
  }

  return { handleSave, isPending, canSave };
}

function getCenterPosition() {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}
