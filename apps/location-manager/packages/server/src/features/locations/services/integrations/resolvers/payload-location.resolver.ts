import type { LocationResponse } from "../../../models/location";
import type { PayloadApiClient, PayloadLocationCreateData } from "../clients/payload-api.client";
import { parseLocationValue } from "../../../utils/location-utils";
import { formatLocationName } from "@questurian/lm-shared";

/**
 * Resolve Payload location reference by locationKey
 */
export async function resolvePayloadLocationRef(
  location: LocationResponse,
  payloadClient: PayloadApiClient
): Promise<string | null> {
  const locationKey = location.locationKey?.trim() || "";

  if (!locationKey) {
    console.warn(`⚠️  Location ${location.id} missing locationKey; skipping Payload location lookup`);
    return null;
  }

  return ensurePayloadLocationRefForKey(locationKey, payloadClient);
}

/**
 * Find or create a Payload `locations` doc for a pipe-delimited taxonomy key.
 */
export async function ensurePayloadLocationRefForKey(
  locationKey: string | null | undefined,
  payloadClient: PayloadApiClient
): Promise<string | null> {
  const key = typeof locationKey === "string" ? locationKey.trim() : "";
  if (!key) return null;

  const existing = await payloadClient.getLocationRefByKey(key);
  if (existing) return existing;

  console.warn(`⚠️  No Payload location found for locationKey: ${key}`);

  const createPayload = buildPayloadLocationData(key);
  if (!createPayload) {
    console.warn(`⚠️  Unable to build Payload location payload for ${key}`);
    return null;
  }

  return await payloadClient.createLocation(createPayload);
}

/**
 * Build a Payload location payload from a locationKey
 */
export function buildPayloadLocationData(locationKey: string): PayloadLocationCreateData | null {
  const parsed = parseLocationValue(locationKey);
  if (!parsed) {
    return null;
  }

  const countryName = formatLocationName(parsed.country);

  if (parsed.city && parsed.neighborhood) {
    return {
      level: "neighborhood",
      country: parsed.country,
      city: parsed.city,
      neighborhood: parsed.neighborhood,
      countryName,
      cityName: formatLocationName(parsed.city),
      neighborhoodName: formatLocationName(parsed.neighborhood),
    };
  }

  if (parsed.city) {
    return {
      level: "city",
      country: parsed.country,
      city: parsed.city,
      countryName,
      cityName: formatLocationName(parsed.city),
    };
  }

  return {
    level: "country",
    country: parsed.country,
    countryName,
  };
}
