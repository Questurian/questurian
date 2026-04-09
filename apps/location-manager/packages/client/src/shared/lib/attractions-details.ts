type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return null;
}

function getNestedValue(record: UnknownRecord | null, path: string[]): unknown {
  if (!record) return undefined;
  let current: unknown = record;

  for (const key of path) {
    const nextRecord = asRecord(current);
    if (!nextRecord) return undefined;
    current = nextRecord[key];
  }

  return current;
}

function hasVisitHoursValue(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
}

export interface AttractionsDetailsPayload extends Record<string, unknown> {
  core: {
    attraction_type: string;
    pricing: string;
    location_key: string;
    district?: string;
  };
  visit: {
    hours: Record<string, unknown>;
    booking_required: boolean;
  };
  contact: {
    website?: string;
    phone: string | null;
    google_maps_url?: string;
  };
}

export interface BuildAttractionsDetailsInput {
  type: string;
  pricing: string;
  locationKey: string;
  district?: string;
  hours: Record<string, unknown>;
  bookingRequired: boolean;
  website?: string;
  phone?: string | null;
  googleUrl?: string;
}

export function buildAttractionsDetails(
  input: BuildAttractionsDetailsInput
): AttractionsDetailsPayload {
  return {
    core: {
      attraction_type: input.type,
      pricing: input.pricing,
      location_key: input.locationKey,
      ...(input.district ? { district: input.district } : {}),
    },
    visit: {
      hours: input.hours,
      booking_required: input.bookingRequired,
    },
    contact: {
      ...(input.website ? { website: input.website } : {}),
      phone: input.phone ?? null,
      ...(input.googleUrl ? { google_maps_url: input.googleUrl } : {}),
    },
  };
}

export interface ParsedAttractionsDetails {
  hasDetails: boolean;
  attractionType: string | null;
  pricing: string | null;
  locationKey: string | null;
  bookingRequired: boolean | null;
  visitHours: Record<string, unknown> | null;
  hasVisitHours: boolean;
  website: string | null;
  phone: string | null;
  googleMapsUrl: string | null;
}

export function parseAttractionsDetails(details: unknown): ParsedAttractionsDetails {
  const root = asRecord(details);
  const visitHoursRaw = getNestedValue(root, ["visit", "hours"]);

  return {
    hasDetails: Boolean(root && Object.keys(root).length > 0),
    attractionType: asString(getNestedValue(root, ["core", "attraction_type"])),
    pricing: asString(getNestedValue(root, ["core", "pricing"])),
    locationKey: asString(getNestedValue(root, ["core", "location_key"])),
    bookingRequired: asBoolean(getNestedValue(root, ["visit", "booking_required"])),
    visitHours: asRecord(visitHoursRaw),
    hasVisitHours: hasVisitHoursValue(visitHoursRaw),
    website: asString(getNestedValue(root, ["contact", "website"])),
    phone: asString(getNestedValue(root, ["contact", "phone"])),
    googleMapsUrl: asString(getNestedValue(root, ["contact", "google_maps_url"])),
  };
}
