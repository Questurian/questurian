import type { LocationResponse } from "../models/location";
import type { Review2BlogExportReview } from "../types/translate-merge-reviews.types";
import type {
  AiJsonPayload,
  Review2BlogEditorialPayload,
  Review2BlogOperationHoursPayload,
  Review2BlogOperationHoursRow,
} from "../types/tripadvisor-place.types";

const REVIEW2BLOG_EXPORT_SCHEMA_VERSION = "review2blog-export-v1" as const;

const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

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

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));
  }

  const single = asString(value);
  return single ? [single] : [];
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }

  return null;
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = asString(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function firstNonEmptyStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const normalized = asStringArray(value);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

function unwrapLabeledValue(value: unknown): unknown {
  const record = asRecord(value);
  if (record && Object.prototype.hasOwnProperty.call(record, "value")) {
    return record.value;
  }

  return value;
}

function getNightlifeSectionValue(
  details: UnknownRecord | null,
  section: "theSpace" | "theScene",
  key: string
): unknown {
  const newSchemaSection = asRecord(details?.[section]);
  const legacySections = asRecord(details?.details);
  const legacySection = asRecord(legacySections?.[section]);
  const candidate = newSchemaSection?.[key] ?? legacySection?.[key];
  return unwrapLabeledValue(candidate);
}

function normalizeOperationHoursRows(value: unknown): Review2BlogOperationHoursRow[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const rawHours = record.hours;
  if (Array.isArray(rawHours)) {
    return rawHours
      .map((row) => {
        const rowRecord = asRecord(row);
        const day = asString(rowRecord?.day);
        const hours = asString(rowRecord?.hours);
        if (!day || !hours) {
          return null;
        }

        return { day, hours };
      })
      .filter((row): row is Review2BlogOperationHoursRow => row !== null);
  }

  return Object.entries(record)
    .filter(([key]) => key !== "currently_open" && key !== "hours")
    .map(([key, hoursValue]) => {
      const hours = asString(hoursValue);
      if (!hours) {
        return null;
      }

      return {
        day: WEEKDAY_LABELS[key.toLowerCase()] ?? key,
        hours,
      };
    })
    .filter((row): row is Review2BlogOperationHoursRow => row !== null);
}

function normalizeOperationHours(value: unknown): Review2BlogOperationHoursPayload {
  const rows = normalizeOperationHoursRows(value);
  const currentlyOpen = asBoolean(asRecord(value)?.currently_open);

  if (currentlyOpen === null) {
    return { hours: rows };
  }

  return {
    hours: rows,
    currently_open: currentlyOpen,
  };
}

function buildEditorialPayload(district: string): Review2BlogEditorialPayload {
  return {
    placement_type: "curated guide",
    selection_angle: "review-backed pick for travelers",
    audience: "travelers",
    tone: "grounded_editorial",
    must_mention: district ? [district] : [],
    avoid: ["best"],
  };
}

export function buildAiJsonPayload(
  location: LocationResponse,
  reviews: Review2BlogExportReview[]
): AiJsonPayload {
  const sharedName = firstNonEmptyString(location.source?.name, location.title);

  switch (location.category) {
    case "dining": {
      const district = firstNonEmptyString(location.district);
      const operationHours = normalizeOperationHours(location.operationHours);
      const tripadvisorCuisines = firstNonEmptyStringArray(location.tripadvisorCuisines);
      const tripadvisorMealTypes = firstNonEmptyStringArray(location.tripadvisorMealTypes);
      const tripadvisorFeatures = firstNonEmptyStringArray(location.tripadvisorFeatures);

      return {
        schemaVersion: REVIEW2BLOG_EXPORT_SCHEMA_VERSION,
        category: "dining",
        name: sharedName,
        type: firstNonEmptyString(location.type),
        district,
        locationKey: firstNonEmptyString(location.locationKey),
        editorial: buildEditorialPayload(district),
        priceLevel: firstNonEmptyString(location.priceLevel),
        idealFor: firstNonEmptyStringArray(location.idealFor),
        tripadvisorCuisines,
        tripadvisorMealTypes,
        tripadvisorFeatures,
        operationHours,
        facts: {
          cuisines: tripadvisorCuisines,
          mealTypes: tripadvisorMealTypes,
          features: tripadvisorFeatures,
          operationHours: operationHours.hours,
        },
        reviews,
      };
    }

    case "accommodations": {
      const details = asRecord(location.accommodationsDetails);
      const core = asRecord(details?.core);
      const theStay = asRecord(details?.the_stay);
      const theExperience = asRecord(details?.the_experience);
      const theDetails = asRecord(details?.the_details);
      const district = firstNonEmptyString(location.district, core?.district);
      const priceLevel = firstNonEmptyString(location.priceLevel, core?.price);
      const perfectFor = firstNonEmptyStringArray(theStay?.perfect_for, location.idealFor);
      const vibe = firstNonEmptyStringArray(theExperience?.vibe);
      const workspace = firstNonEmptyString(theExperience?.workspace);
      const pool = firstNonEmptyStringArray(theExperience?.pool);
      const gym = firstNonEmptyString(theExperience?.gym);
      const walkability = firstNonEmptyString(theDetails?.walkability);

      return {
        schemaVersion: REVIEW2BLOG_EXPORT_SCHEMA_VERSION,
        category: "accommodations",
        name: firstNonEmptyString(location.source?.name, location.title, core?.name),
        type: firstNonEmptyString(location.type, core?.type),
        district,
        locationKey: firstNonEmptyString(location.locationKey),
        editorial: buildEditorialPayload(district),
        priceLevel,
        idealFor: firstNonEmptyStringArray(location.idealFor, perfectFor),
        accommodationsDetails: {
          core: {
            type: firstNonEmptyString(location.type, core?.type),
            district,
            price: priceLevel,
          },
          the_stay: {
            perfect_for: perfectFor,
            kid_friendly: asBoolean(theStay?.kid_friendly) ?? false,
            wifi: asBoolean(theStay?.wifi) ?? false,
            ac: asBoolean(theStay?.ac) ?? false,
            breakfast_served: asBoolean(theStay?.breakfast_served) ?? false,
            parking: firstNonEmptyStringArray(theStay?.parking),
          },
          the_experience: {
            vibe,
            workspace,
            pool,
            rooftop_lounge: asBoolean(theExperience?.rooftop_lounge) ?? false,
            gym,
          },
          the_details: {
            walkability,
          },
        },
        facts: {
          perfectFor,
          kidFriendly: asBoolean(theStay?.kid_friendly) ?? false,
          wifi: asBoolean(theStay?.wifi) ?? false,
          ac: asBoolean(theStay?.ac) ?? false,
          breakfastServed: asBoolean(theStay?.breakfast_served) ?? false,
          parking: firstNonEmptyStringArray(theStay?.parking),
          vibe,
          workspace,
          pool,
          rooftopLounge: asBoolean(theExperience?.rooftop_lounge) ?? false,
          gym,
          walkability,
        },
        reviews,
      };
    }

    case "attractions": {
      const details = asRecord(location.attractionsDetails);
      const core = asRecord(details?.core);
      const visit = asRecord(details?.visit);
      const district = firstNonEmptyString(location.district, core?.district);
      const locationKey = firstNonEmptyString(location.locationKey, core?.location_key);
      const attractionType = firstNonEmptyString(location.type, core?.attraction_type);
      const priceLevel = firstNonEmptyString(location.priceLevel, core?.pricing);
      const idealFor = firstNonEmptyStringArray(location.idealFor, visit?.ideal_for);
      const bookingRequired = asBoolean(visit?.booking_required) ?? false;
      const operationHours = normalizeOperationHours(location.operationHours ?? visit?.hours);

      return {
        schemaVersion: REVIEW2BLOG_EXPORT_SCHEMA_VERSION,
        category: "attractions",
        name: sharedName,
        type: attractionType,
        district,
        locationKey,
        editorial: buildEditorialPayload(district),
        priceLevel,
        idealFor,
        attractionsDetails: {
          core: {
            attraction_type: attractionType,
            pricing: priceLevel,
            district,
            location_key: locationKey,
          },
          visit: {
            booking_required: bookingRequired,
            ideal_for: idealFor,
            hours: operationHours,
          },
        },
        operationHours,
        facts: {
          attractionType,
          pricing: priceLevel,
          bookingRequired,
          idealFor,
          operationHours: operationHours.hours,
        },
        reviews,
      };
    }

    case "nightlife": {
      const details = asRecord(location.nightlifeDetails);
      const core = asRecord(details?.core);
      const district = firstNonEmptyString(location.district);
      const clubType = firstNonEmptyString(location.type, core?.clubType, details?.club_type);
      const priceTier = firstNonEmptyString(location.priceLevel, core?.priceTier, details?.price_tier);
      const idealFor = firstNonEmptyStringArray(location.idealFor, core?.idealFor);
      const music = firstNonEmptyStringArray(core?.music, details?.music);
      const venueType = firstNonEmptyString(getNightlifeSectionValue(details, "theSpace", "venueType"));
      const venueSize = firstNonEmptyString(getNightlifeSectionValue(details, "theSpace", "venueSize"));
      const vibe = firstNonEmptyStringArray(getNightlifeSectionValue(details, "theSpace", "vibe"));
      const peakHours = firstNonEmptyString(getNightlifeSectionValue(details, "theSpace", "peakHours"));
      const dressCode = firstNonEmptyStringArray(
        getNightlifeSectionValue(details, "theScene", "dressCode")
      );
      const energyLevel = firstNonEmptyString(
        getNightlifeSectionValue(details, "theScene", "energyLevel")
      );
      const crowdProfile = firstNonEmptyString(
        getNightlifeSectionValue(details, "theScene", "crowdProfile")
      );
      const touristPresence = firstNonEmptyString(
        getNightlifeSectionValue(details, "theScene", "touristPresence")
      );
      const operationHours = normalizeOperationHours(location.operationHours);

      return {
        schemaVersion: REVIEW2BLOG_EXPORT_SCHEMA_VERSION,
        category: "nightlife",
        name: firstNonEmptyString(location.source?.name, location.title, details?.name),
        type: clubType,
        district,
        locationKey: firstNonEmptyString(location.locationKey),
        editorial: buildEditorialPayload(district),
        priceLevel: priceTier,
        idealFor,
        nightlifeDetails: {
          club_type: clubType,
          price_tier: priceTier,
          music,
          details: {
            theSpace: {
              venueType: { value: venueType },
              venueSize: { value: venueSize },
              vibe: { value: vibe },
              peakHours: { value: peakHours },
            },
            theScene: {
              dressCode: { value: dressCode },
              energyLevel: { value: energyLevel },
              crowdProfile: { value: crowdProfile },
              ...(touristPresence ? { touristPresence: { value: touristPresence } } : {}),
            },
          },
          core: {
            clubType,
            priceTier,
            idealFor,
            music,
          },
        },
        operationHours,
        facts: {
          clubType,
          priceTier,
          music,
          venueType,
          venueSize,
          vibe,
          peakHours,
          dressCode,
          energyLevel,
          crowdProfile,
          touristPresence,
          operationHours: operationHours.hours,
        },
        reviews,
      };
    }

    case "key_locations": {
      const details = asRecord(location.keyLocationsDetails);
      const core = asRecord(details?.core);
      const locationType = firstNonEmptyString(
        location.type,
        details?.location_type,
        core?.locationType,
        core?.location_type
      );
      const neighborhood = firstNonEmptyString(
        location.district,
        details?.neighborhood,
        core?.neighborhood
      );
      const locationKey = firstNonEmptyString(location.locationKey, details?.location_key);
      const status = firstNonEmptyString(details?.status, core?.status);
      const operationHours = normalizeOperationHours(location.operationHours ?? details?.hours ?? core?.hours);

      return {
        schemaVersion: REVIEW2BLOG_EXPORT_SCHEMA_VERSION,
        category: "key_locations",
        name: sharedName,
        type: locationType,
        district: neighborhood,
        locationKey,
        editorial: buildEditorialPayload(neighborhood),
        priceLevel: firstNonEmptyString(location.priceLevel),
        idealFor: firstNonEmptyStringArray(location.idealFor),
        keyLocationsDetails: {
          location_type: locationType,
          neighborhood,
          status,
          ...(locationKey ? { location_key: locationKey } : {}),
        },
        operationHours,
        facts: {
          locationType,
          neighborhood,
          status,
          operationHours: operationHours.hours,
        },
        reviews,
      };
    }

    default: {
      const exhaustiveCheck: never = location.category;
      throw new Error(`Unsupported AI JSON category: ${String(exhaustiveCheck)}`);
    }
  }
}
