import type { UpdateMapsRequest } from "@client/shared/services/api/types";
import { isValidLocationKey } from "@client/shared/lib/taxonomy-location";
import type { CompletenessFieldDraft } from "./drafts/use-completeness-field-draft";
import { withAttractionContactDetail } from "./completeness-detail-fields";
import { parseCoordinateInput } from "./field-value-utils";
import { buildOperationHoursJson } from "./operation-hours/operation-hours-utils";
import type { SaveStrategy } from "./submission/save-strategy";

/**
 * Strategy for plain string-backed fields. `buildPayload` returns the update
 * payload for the trimmed draft value, or `null` when the value cannot be
 * saved (which also disables the Save button).
 */
export function simpleValueStrategy(
  buildPayload: (trimmed: string) => Partial<UpdateMapsRequest> | null
): SaveStrategy {
  return {
    canSave: ({ draft }) => buildPayload(draft.value.trim()) !== null,
    save: ({ field, draft, save }) => {
      const payload = buildPayload(draft.value.trim());
      if (payload) {
        save(payload as UpdateMapsRequest, `${field.label} saved`, `Failed to save ${field.label}`);
      }
    },
  };
}

function getCoordinateValidation(
  draft: CompletenessFieldDraft
): { valid: true; lat: number; lng: number } | { valid: false; message: string } {
  const lat = parseCoordinateInput(draft.coordinateDraft.lat);
  const lng = parseCoordinateInput(draft.coordinateDraft.lng);
  if (lat == null || lng == null) return { valid: false, message: "Latitude and longitude are required" };
  if (lat < -90 || lat > 90) return { valid: false, message: "Latitude must be between -90 and 90" };
  if (lng < -180 || lng > 180) return { valid: false, message: "Longitude must be between -180 and 180" };
  return { valid: true, lat, lng };
}

export const coordinatesStrategy: SaveStrategy = {
  canSave: ({ draft }) => getCoordinateValidation(draft).valid,
  save: ({ draft, save, showValidationError }) => {
    const validation = getCoordinateValidation(draft);
    if (!validation.valid) {
      showValidationError(validation.message);
      return;
    }
    save({ lat: validation.lat, lng: validation.lng }, "Coordinates saved", "Failed to save coordinates");
  },
};

export const taxonomyStrategy: SaveStrategy = {
  canSave: ({ draft }) => {
    const locationKey = draft.taxonomyLocationKey.trim();
    return !locationKey || isValidLocationKey(locationKey);
  },
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

export const phoneStrategy: SaveStrategy = {
  canSave: () => true,
  save: ({ locationDetail, draft, save }) => {
    const phoneNumber = draft.phoneNotAvailable ? "" : draft.value.trim();
    save(
      withAttractionContactDetail(
        locationDetail,
        { phoneNumber, phoneUnavailable: draft.phoneNotAvailable },
        "phone",
        phoneNumber
      ),
      "Phone saved",
      "Failed to save phone"
    );
  },
};

export const websiteStrategy: SaveStrategy = {
  canSave: () => true,
  save: ({ locationDetail, draft, save }) => {
    const website = draft.value.trim();
    save(
      withAttractionContactDetail(locationDetail, { website }, "website", website),
      "Website saved",
      "Failed to save Website"
    );
  },
};

export const contactUrlStrategy: SaveStrategy = {
  canSave: ({ locationDetail }) =>
    Boolean(locationDetail.source?.name?.trim() && locationDetail.source?.address?.trim()),
  save: ({ locationDetail, save, showValidationError }) => {
    const name = locationDetail.source?.name?.trim();
    const address = locationDetail.source?.address?.trim();
    if (!name || !address) {
      showValidationError("Name and Source Address are required to generate Google URL");
      return;
    }
    save({ name, address }, "Google URL regenerated", "Failed to regenerate Google URL");
  },
};

export const idealForStrategy: SaveStrategy = {
  canSave: ({ draft }) => draft.idealForDraft.length > 0,
  save: ({ draft, save, showValidationError }) => {
    if (!draft.idealForDraft.length) {
      showValidationError("Select at least one Ideal For tag");
      return;
    }
    save({ idealFor: draft.idealForDraft }, "Ideal For saved", "Failed to save Ideal For");
  },
};

export const cuisinesStrategy: SaveStrategy = {
  canSave: () => true,
  save: ({ draft, save }) =>
    save(
      { tripadvisorCuisines: draft.cuisinesDraft.length ? draft.cuisinesDraft : null },
      "Cuisines saved",
      "Failed to save cuisines"
    ),
};

export const operationHoursStrategy: SaveStrategy = {
  canSave: () => true,
  save: ({ draft, save }) =>
    save({ operationHours: buildOperationHoursJson(draft.dayEntries) }, "Hours saved", "Failed to save hours"),
};

/** `media` is rendered by the modal shell; saving just closes it. */
export const mediaStrategy: SaveStrategy = {
  canSave: () => true,
  save: ({ close }) => close(),
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export function rawJsonStrategy(
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

export function detailsJson(value: unknown): string {
  return value ? JSON.stringify(value, null, 2) : "";
}
