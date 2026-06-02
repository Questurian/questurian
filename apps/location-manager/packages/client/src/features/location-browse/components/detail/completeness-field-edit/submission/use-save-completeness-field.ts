import type { LocationResponse, UpdateMapsRequest } from "@client/shared/services/api/types";
import { useUpdateLocation } from "@client/shared/services/api/hooks/useUpdateLocation";
import { useToast } from "@client/shared/hooks/useToast";
import { isValidLocationKey } from "@client/shared/lib/taxonomy-location";
import {
  buildNightlifeFieldUpdatePayload,
  isNightlifeFieldKey,
  isNightlifeMultiFieldKey,
} from "@client/shared/lib/nightlife-details";
import {
  buildDetailFieldUpdatePayload,
  getDetailFieldConfig,
} from "../completeness-detail-fields";
import type { FieldDef } from "../completeness-field-edit.types";
import type { useCompletenessFieldDraft } from "../drafts/use-completeness-field-draft";
import { parseCoordinateInput } from "../field-value-utils";
import { buildOperationHoursJson } from "../operation-hours/operation-hours-utils";
import { getCenterToastPosition } from "../toast-position";
import { buildFieldUpdatePayload } from "./build-field-update-payload";

interface UseSaveCompletenessFieldProps {
  field: FieldDef;
  locationDetail: LocationResponse;
  draft: ReturnType<typeof useCompletenessFieldDraft>;
  onClose: () => void;
}

type CompletenessDraft = ReturnType<typeof useCompletenessFieldDraft>;

interface SaveStrategyContext {
  field: FieldDef;
  locationDetail: LocationResponse;
  draft: CompletenessDraft;
  save: (data: UpdateMapsRequest, successMessage: string, errorMessage: string) => void;
  close: () => void;
  showValidationError: (message: string) => void;
}

interface SaveStrategy {
  canSave: (context: SaveStrategyContext) => boolean;
  save: (context: SaveStrategyContext) => void;
}

const saveStrategies: Record<string, SaveStrategy> = {
  media: {
    canSave: () => true,
    save: ({ close }) => close(),
  },
  operationHours: {
    canSave: () => true,
    save: ({ draft, save }) =>
      save({ operationHours: buildOperationHoursJson(draft.dayEntries) }, "Hours saved", "Failed to save hours"),
  },
  coordinates: {
    canSave: ({ draft }) => getCoordinateValidation(draft).valid,
    save: ({ draft, save, showValidationError }) => {
      const validation = getCoordinateValidation(draft);
      if (!validation.valid) {
        showValidationError(validation.message);
        return;
      }
      save({ lat: validation.lat, lng: validation.lng }, "Coordinates saved", "Failed to save coordinates");
    },
  },
  contactUrl: {
    canSave: ({ locationDetail }) => hasSourceNameAndAddress(locationDetail),
    save: ({ locationDetail, save, showValidationError }) => {
      const name = locationDetail.source?.name?.trim();
      const address = locationDetail.source?.address?.trim();
      if (!name || !address) {
        showValidationError("Name and Source Address are required to generate Google URL");
        return;
      }
      save({ name, address }, "Google URL regenerated", "Failed to regenerate Google URL");
    },
  },
  idealFor: {
    canSave: ({ draft }) => draft.idealForDraft.length > 0,
    save: ({ draft, save, showValidationError }) => {
      if (!draft.idealForDraft.length) {
        showValidationError("Select at least one Ideal For tag");
        return;
      }
      save({ idealFor: draft.idealForDraft }, "Ideal For saved", "Failed to save Ideal For");
    },
  },
  locationKey: createTaxonomyStrategy(),
  district: createTaxonomyStrategy(),
  cuisines: {
    canSave: () => true,
    save: ({ draft, save }) =>
      save(
        { tripadvisorCuisines: draft.cuisinesDraft.length ? draft.cuisinesDraft : null },
        "Cuisines saved",
        "Failed to save cuisines"
      ),
  },
  nightlifeDetails: createRawJsonStrategy("nightlifeDetails"),
  accommodationsDetails: createRawJsonStrategy("accommodationsDetails"),
  attractionsDetails: createRawJsonStrategy("attractionsDetails"),
  keyLocationsDetails: createRawJsonStrategy("keyLocationsDetails"),
};

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
          showToast(successMessage, getCenterToastPosition());
          onClose();
        },
        onError: (error) => showToast(error.message || errorMessage, getCenterToastPosition()),
      }
    );
  };

  function showValidationError(message: string) {
    showToast(message, getCenterToastPosition());
  }

  const strategy = getSaveStrategy(field.key);
  const strategyContext: SaveStrategyContext = {
    field,
    locationDetail,
    draft,
    save,
    close: onClose,
    showValidationError,
  };

  const handleSave = () => {
    strategy.save(strategyContext);
  };

  const canSave = strategy.canSave(strategyContext);

  return { handleSave, isPending, canSave };
}

function getSaveStrategy(fieldKey: string): SaveStrategy {
  if (isNightlifeFieldKey(fieldKey)) return nightlifeStrategy;
  if (getDetailFieldConfig(fieldKey)) return detailFieldStrategy;
  return saveStrategies[fieldKey] ?? defaultFieldStrategy;
}

const detailFieldStrategy: SaveStrategy = {
  canSave: ({ field, draft }) => {
    const config = getDetailFieldConfig(field.key);
    if (!config) return false;
    return config.kind === "multi"
      ? draft.detailMultiDraft.length > 0
      : draft.value.trim().length > 0;
  },
  save: ({ field, locationDetail, draft, save, showValidationError }) => {
    const config = getDetailFieldConfig(field.key);
    if (!config) return;
    const value = config.kind === "multi" ? draft.detailMultiDraft : draft.value;
    if (Array.isArray(value) ? !value.length : !value.trim()) {
      showValidationError(
        config.kind === "multi"
          ? `Select at least one ${config.label.toLowerCase()} option`
          : `Select a value for ${config.label.toLowerCase()}`
      );
      return;
    }
    save(
      buildDetailFieldUpdatePayload(config, locationDetail, value),
      `${config.label} saved`,
      `Failed to save ${config.label}`
    );
  },
};

function createTaxonomyStrategy(): SaveStrategy {
  return {
    canSave: ({ draft }) => isTaxonomyLocationKeyValid(draft),
    save: ({ draft, save, showValidationError }) => {
      const locationKey = draft.taxonomyLocationKey.trim();
      if (locationKey && !isValidLocationKey(locationKey)) {
        showValidationError("Location Key must be lowercase kebab-case (country|city|neighborhood)");
        return;
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
    },
  };
}

function createRawJsonStrategy(
  fieldKey: "nightlifeDetails" | "accommodationsDetails" | "attractionsDetails" | "keyLocationsDetails"
): SaveStrategy {
  return {
    canSave: ({ draft }) => parseRawJsonDraft(draft.value).valid,
    save: ({ field, draft, save, showValidationError }) => {
      const parsed = parseRawJsonDraft(draft.value);
      if (!parsed.valid) {
        showValidationError(parsed.message);
        return;
      }
      save({ [fieldKey]: parsed.value }, `${field.label} saved`, `Failed to save ${field.label}`);
    },
  };
}

function parseRawJsonDraft(
  value: string
): { valid: true; value: Record<string, unknown> | null } | { valid: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: true, value: null };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null) return { valid: true, value: null };
    if (!isPlainRecord(parsed)) return { valid: false, message: "JSON must be an object" };
    return { valid: true, value: parsed };
  } catch {
    return { valid: false, message: "Enter valid JSON before saving" };
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const nightlifeStrategy: SaveStrategy = {
  canSave: ({ field, draft }) => {
    if (!isNightlifeFieldKey(field.key)) return false;
    return isNightlifeMultiFieldKey(field.key)
      ? draft.nightlifeMultiDraft.length > 0
      : draft.value.trim().length > 0;
  },
  save: ({ field, locationDetail, draft, save, showValidationError }) => {
    if (!isNightlifeFieldKey(field.key)) return;
    const fieldKey = field.key;
    const value = isNightlifeMultiFieldKey(fieldKey) ? draft.nightlifeMultiDraft : draft.value;
    if (Array.isArray(value) ? !value.length : !value.trim()) {
      showValidationError(
        isNightlifeMultiFieldKey(fieldKey)
          ? `Select at least one ${field.label.toLowerCase()} option`
          : `Select an option for ${field.label.toLowerCase()}`
      );
      return;
    }
    save(
      buildNightlifeFieldUpdatePayload(locationDetail.nightlifeDetails, fieldKey, value),
      `${field.label} saved`,
      `Failed to save ${field.label}`
    );
  },
};

const defaultFieldStrategy: SaveStrategy = {
  canSave: ({ field, draft }) => buildFieldUpdatePayload(field.key, draft.value) !== null,
  save: ({ field, draft, save }) => {
    const payload = buildFieldUpdatePayload(field.key, draft.value);
    if (payload) save(payload, `${field.label} saved`, `Failed to save ${field.label}`);
  },
};

function hasSourceNameAndAddress(locationDetail: LocationResponse) {
  return Boolean(locationDetail.source?.name?.trim() && locationDetail.source?.address?.trim());
}

function isTaxonomyLocationKeyValid(draft: CompletenessDraft) {
  const locationKey = draft.taxonomyLocationKey.trim();
  return !locationKey || isValidLocationKey(locationKey);
}

function getCoordinateValidation(
  draft: CompletenessDraft
):
  | { valid: true; lat: number; lng: number }
  | { valid: false; message: string } {
  const lat = parseCoordinateInput(draft.coordinateDraft.lat);
  const lng = parseCoordinateInput(draft.coordinateDraft.lng);
  if (lat == null || lng == null) return { valid: false, message: "Latitude and longitude are required" };
  if (lat < -90 || lat > 90) return { valid: false, message: "Latitude must be between -90 and 90" };
  if (lng < -180 || lng > 180) return { valid: false, message: "Longitude must be between -180 and 180" };
  return { valid: true, lat, lng };
}
