import type { LocationResponse, UpdateMapsRequest } from "@client/shared/services/api/types";
import {
  parseAccommodationsDetails,
  type ParsedAccommodationsDetails,
} from "@client/shared/lib/accommodations-details";
import { parseAttractionsDetails } from "@client/shared/lib/attractions-details";
import {
  BOOLEAN_OPTIONS,
  CHECK_IN_TIME_OPTIONS,
  CHECK_OUT_TIME_OPTIONS,
  GYM_OPTIONS,
  JACUZZI_OPTIONS,
  PARKING_OPTIONS,
  PERFECT_FOR_OPTIONS,
  POOL_OPTIONS,
  PRICE_OPTIONS,
  VIBE_OPTIONS,
  WALKABILITY_OPTIONS,
  WORKSPACE_OPTIONS,
} from "@questurian/lm-shared";

/**
 * Granular, field-level editing for the `*Details` JSON blobs surfaced by the
 * location completeness checklist. This mirrors the nightlife field-config
 * pattern (see shared/lib/nightlife-details.ts) so that clicking a completeness
 * pill such as "Kid Friendly" opens a targeted editor for that single field
 * instead of a raw JSON blob titled "Accommodations Profile".
 */

export type DetailFieldKind = "single" | "multi" | "boolean" | "text";

export interface DetailFieldOption {
  value: string;
  label: string;
  description: string;
}

export type DetailDraftValue = string | string[];

type DetailsKey = "accommodationsDetails" | "attractionsDetails" | "keyLocationsDetails";

export interface DetailFieldConfig {
  /** How the value is edited and encoded into the details JSON. */
  kind: DetailFieldKind;
  /** Human-readable label, reused for the editor heading and toasts. */
  label: string;
  /** Options for `single`/`boolean`/`multi` editors. */
  options?: DetailFieldOption[];
  /** Which top-level details column on the location this field lives in. */
  detailsKey: DetailsKey;
  /** Path within the details JSON where the value is stored. */
  path: string[];
  /** Top-level column to keep in sync (e.g. `type`, `priceLevel`). */
  mirror?: "type" | "priceLevel";
  /** Optional checklist fields may be explicitly cleared. */
  allowEmpty?: boolean;
  /** Reads the current value for the editor draft. */
  read: (location: LocationResponse) => DetailDraftValue;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSingle(value: DetailDraftValue): string {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim().length > 0)?.trim() ?? "";
  }
  return value.trim();
}

function normalizeMulti(value: DetailDraftValue): string[] {
  return (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
}

function boolToDraft(value: boolean | null): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

function cloneDetails(value: unknown): UnknownRecord {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? (JSON.parse(JSON.stringify(parsed)) as UnknownRecord) : {};
    } catch {
      return {};
    }
  }
  return isRecord(value) ? (JSON.parse(JSON.stringify(value)) as UnknownRecord) : {};
}

function setNested(root: UnknownRecord, path: string[], value: unknown) {
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (!isRecord(current[key])) {
      current[key] = {};
    }
    current = current[key] as UnknownRecord;
  }
  current[path[path.length - 1]] = value;
}

function deleteNested(root: UnknownRecord, path: string[]) {
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const next = current[path[index]];
    if (!isRecord(next)) return;
    current = next;
  }
  delete current[path[path.length - 1]];
}

function encodeValue(kind: DetailFieldKind, value: DetailDraftValue): unknown {
  if (kind === "multi") return normalizeMulti(value);
  if (kind === "boolean") {
    const normalized = normalizeSingle(value);
    if (normalized === "yes") return true;
    if (normalized === "no") return false;
    return null;
  }
  return normalizeSingle(value);
}

// --- Accommodations -------------------------------------------------------

function accFieldText(
  path: string[],
  label: string,
  read: (parsed: ParsedAccommodationsDetails, location: LocationResponse) => DetailDraftValue,
  mirror?: DetailFieldConfig["mirror"],
  options?: DetailFieldOption[]
): DetailFieldConfig {
  const kind: DetailFieldKind = options ? "single" : "text";
  return {
    kind,
    label,
    options,
    detailsKey: "accommodationsDetails",
    path,
    mirror,
    read: (location) => read(parseAccommodationsDetails(location.accommodationsDetails), location),
  };
}

function accFieldSingle(
  path: string[],
  label: string,
  options: DetailFieldOption[],
  read: (parsed: ParsedAccommodationsDetails) => DetailDraftValue
): DetailFieldConfig {
  return {
    kind: "single",
    label,
    options,
    detailsKey: "accommodationsDetails",
    path,
    read: (location) => read(parseAccommodationsDetails(location.accommodationsDetails)),
  };
}

function accFieldMulti(
  path: string[],
  label: string,
  options: DetailFieldOption[],
  read: (parsed: ParsedAccommodationsDetails) => string[]
): DetailFieldConfig {
  return {
    kind: "multi",
    label,
    options,
    detailsKey: "accommodationsDetails",
    path,
    read: (location) => read(parseAccommodationsDetails(location.accommodationsDetails)),
  };
}

function accFieldBoolean(
  path: string[],
  label: string,
  read: (parsed: ParsedAccommodationsDetails) => boolean | null
): DetailFieldConfig {
  return {
    kind: "boolean",
    label,
    options: BOOLEAN_OPTIONS,
    detailsKey: "accommodationsDetails",
    path,
    read: (location) => boolToDraft(read(parseAccommodationsDetails(location.accommodationsDetails))),
  };
}

const ACCOMMODATIONS_FIELDS: Record<string, DetailFieldConfig> = {
  "accommodations.type": accFieldText(
    ["core", "type"],
    "Type",
    (parsed, location) => parsed.coreType ?? location.type?.trim() ?? "",
    "type"
  ),
  "accommodations.price": accFieldText(
    ["core", "price"],
    "Price",
    (parsed, location) => parsed.corePrice ?? location.priceLevel?.trim() ?? "",
    "priceLevel",
    PRICE_OPTIONS
  ),
  "accommodations.perfectFor": accFieldMulti(["the_stay", "perfect_for"], "Perfect For", PERFECT_FOR_OPTIONS, (p) => p.perfectFor),
  "accommodations.kidFriendly": accFieldBoolean(["the_stay", "kid_friendly"], "Kid Friendly", (p) => p.kidFriendly),
  "accommodations.ac": accFieldBoolean(["the_stay", "ac"], "AC", (p) => p.ac),
  "accommodations.wifi": accFieldBoolean(["the_stay", "wifi"], "WiFi", (p) => p.wifi),
  "accommodations.extraGuestFee": accFieldBoolean(["the_stay", "extra_guest_fee"], "Extra Guest Fee", (p) => p.extraGuestFee),
  "accommodations.parking": accFieldMulti(["the_stay", "parking"], "Parking", PARKING_OPTIONS, (p) => p.parking),
  "accommodations.breakfastServed": accFieldBoolean(["the_stay", "breakfast_served"], "Breakfast Served", (p) => p.breakfastServed),
  "accommodations.vibe": accFieldMulti(["the_experience", "vibe"], "Vibe", VIBE_OPTIONS, (p) => p.vibe),
  "accommodations.workspace": accFieldMulti(["the_experience", "workspace"], "Workspace", WORKSPACE_OPTIONS, (p) => p.workspace),
  "accommodations.restaurant": accFieldBoolean(["the_experience", "restaurant"], "Restaurant", (p) => p.restaurant),
  "accommodations.pool": accFieldMulti(["the_experience", "pool"], "Pool", POOL_OPTIONS, (p) => p.pool),
  "accommodations.rooftopLounge": accFieldBoolean(["the_experience", "rooftop_lounge"], "Rooftop Lounge", (p) => p.rooftopLounge),
  "accommodations.jacuzzi": accFieldMulti(["the_experience", "jacuzzi"], "Jacuzzi", JACUZZI_OPTIONS, (p) => p.jacuzzi),
  "accommodations.gym": accFieldSingle(["the_experience", "gym"], "Gym", GYM_OPTIONS, (p) => p.gym ?? ""),
  "accommodations.walkability": accFieldSingle(["the_details", "walkability"], "Walkability", WALKABILITY_OPTIONS, (p) => p.walkability ?? ""),
  "accommodations.checkInTime": accFieldSingle(["the_details", "check_in_time"], "Check-In", CHECK_IN_TIME_OPTIONS, (p) => p.checkInTime ?? ""),
  "accommodations.checkOutTime": accFieldSingle(["the_details", "check_out_time"], "Check-Out", CHECK_OUT_TIME_OPTIONS, (p) => p.checkOutTime ?? ""),
};

// --- Attractions ----------------------------------------------------------

const ATTRACTIONS_PRICING_OPTIONS: DetailFieldOption[] = [
  { value: "free", label: "Free", description: "No admission cost." },
  { value: "$", label: "$", description: "Budget-friendly pricing." },
  { value: "$$", label: "$$", description: "Moderate pricing tier." },
  { value: "$$$", label: "$$$", description: "Premium pricing tier." },
  { value: "$$$$", label: "$$$$", description: "Luxury pricing tier." },
];

const ATTRACTIONS_FIELDS: Record<string, DetailFieldConfig> = {
  "attractions.type": {
    kind: "text",
    label: "Type",
    detailsKey: "attractionsDetails",
    path: ["core", "attraction_type"],
    mirror: "type",
    read: (location) =>
      parseAttractionsDetails(location.attractionsDetails).attractionType ?? location.type?.trim() ?? "",
  },
  "attractions.pricing": {
    kind: "single",
    label: "Pricing",
    options: ATTRACTIONS_PRICING_OPTIONS,
    detailsKey: "attractionsDetails",
    path: ["core", "pricing"],
    mirror: "priceLevel",
    allowEmpty: true,
    read: (location) =>
      parseAttractionsDetails(location.attractionsDetails).pricing ?? location.priceLevel?.trim() ?? "",
  },
  "attractions.bookingRequired": {
    kind: "boolean",
    label: "Booking Required",
    options: BOOLEAN_OPTIONS,
    detailsKey: "attractionsDetails",
    path: ["visit", "booking_required"],
    read: (location) => boolToDraft(parseAttractionsDetails(location.attractionsDetails).bookingRequired),
  },
};

// --- Key locations --------------------------------------------------------

const KEY_LOCATIONS_STATUS_OPTIONS: DetailFieldOption[] = [
  { value: "active", label: "Active", description: "Currently operating." },
  { value: "inactive", label: "Inactive", description: "Not currently operating." },
  { value: "seasonal", label: "Seasonal", description: "Operates seasonally." },
];

function readKeyLocationString(location: LocationResponse, key: string): string {
  const details = location.keyLocationsDetails;
  if (!isRecord(details)) return "";
  const value = details[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

const KEY_LOCATIONS_FIELDS: Record<string, DetailFieldConfig> = {
  "keyLocations.type": {
    kind: "text",
    label: "Type",
    detailsKey: "keyLocationsDetails",
    path: ["location_type"],
    mirror: "type",
    read: (location) => readKeyLocationString(location, "location_type") || (location.type?.trim() ?? ""),
  },
  "keyLocations.status": {
    kind: "single",
    label: "Status",
    options: KEY_LOCATIONS_STATUS_OPTIONS,
    detailsKey: "keyLocationsDetails",
    path: ["status"],
    read: (location) => readKeyLocationString(location, "status"),
  },
};

const DETAIL_FIELD_CONFIG: Record<string, DetailFieldConfig> = {
  ...ACCOMMODATIONS_FIELDS,
  ...ATTRACTIONS_FIELDS,
  ...KEY_LOCATIONS_FIELDS,
};

export function getDetailFieldConfig(fieldKey: string): DetailFieldConfig | undefined {
  return DETAIL_FIELD_CONFIG[fieldKey];
}

export function isDetailFieldKey(fieldKey: string): boolean {
  return fieldKey in DETAIL_FIELD_CONFIG;
}

export function isDetailMultiFieldKey(fieldKey: string): boolean {
  return DETAIL_FIELD_CONFIG[fieldKey]?.kind === "multi";
}

function hasDetailFieldValue(config: DetailFieldConfig, value: DetailDraftValue): boolean {
  return config.kind === "multi"
    ? normalizeMulti(value).length > 0
    : normalizeSingle(value).length > 0;
}

export function canSaveDetailFieldValue(
  config: DetailFieldConfig,
  value: DetailDraftValue
): boolean {
  return Boolean(config.allowEmpty || hasDetailFieldValue(config, value));
}

export function withAttractionContactDetail(
  location: LocationResponse,
  payload: UpdateMapsRequest,
  field: "website" | "phone",
  value: string
): UpdateMapsRequest {
  if (location.category !== "attractions") return payload;

  const details = cloneDetails(location.attractionsDetails);
  const path = ["contact", field];
  const normalized = value.trim();
  if (normalized) {
    setNested(details, path, normalized);
  } else {
    deleteNested(details, path);
  }

  return { ...payload, attractionsDetails: details };
}

export function buildDetailFieldUpdatePayload(
  config: DetailFieldConfig,
  location: LocationResponse,
  value: DetailDraftValue
): UpdateMapsRequest {
  const details = cloneDetails(location[config.detailsKey]);
  if (config.allowEmpty && !hasDetailFieldValue(config, value)) {
    deleteNested(details, config.path);
  } else {
    setNested(details, config.path, encodeValue(config.kind, value));
  }

  const payload: UpdateMapsRequest = { [config.detailsKey]: details };
  if (config.mirror === "type") payload.type = normalizeSingle(value);
  if (config.mirror === "priceLevel") payload.priceLevel = normalizeSingle(value);
  return payload;
}
