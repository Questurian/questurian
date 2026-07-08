import type { LocationProvenance } from "@questurian/lm-shared";
import type { LocationCategory } from "../../../models/location";
import { BadRequestError } from "@shared/errors/http-error";
import type { GooglePrefillResult, MapsServiceOperationContext } from "./maps.types";
import {
  createFromMaps,
  generateGoogleMapsUrl,
} from "../maps.dependencies";

export async function resolveGooglePrefillOperation(
  context: MapsServiceOperationContext,
  name: string,
  address: string,
  category?: LocationCategory,
  diningEnrichmentOverrides?: {
    operatorTripadvisorUrl?: string;
    noTripadvisorListing?: boolean;
  }
): Promise<GooglePrefillResult> {
  const trimmedName = name.trim();
  const trimmedAddress = address.trim();

  if (!trimmedName || !trimmedAddress) {
    throw new BadRequestError("Name and address required");
  }

  if (!context.config.hasGoogleMapsKey()) {
    throw new BadRequestError("Google Maps API key not configured");
  }

  const entry = await createFromMaps(
    trimmedName,
    trimmedAddress,
    context.config.GOOGLE_MAPS_API_KEY,
    "nightlife",
    undefined,
    { includeOperationHours: true }
  );

  if (entry.lat == null || entry.lng == null || !entry.placeId) {
    throw new BadRequestError(
      "Could not resolve Place ID and coordinates from Google for this name and address"
    );
  }

  const operationHours = (() => {
    if (!entry.hoursJson) return null;
    try {
      const parsed = JSON.parse(entry.hoursJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  })();

  const [accommodationsHints, diningEnrichment] = await Promise.all([
    context.resolveAccommodationsHints(
      category,
      trimmedName,
      trimmedAddress,
      entry.lat,
      entry.lng
    ),
    context.resolveDiningEnrichment(category, entry.placeId, diningEnrichmentOverrides),
  ]);

  const provenance: LocationProvenance = {};
  if (diningEnrichment.type) provenance.type = "google";
  if (diningEnrichment.tripadvisorUrl) {
    provenance.tripadvisorUrl = diningEnrichment.tripadvisorUrlProvenance;
  }
  if (diningEnrichment.menuUrl) provenance.menuUrl = "scraper";
  if (diningEnrichment.bookingUrl) provenance.bookingUrl = "scraper";

  return {
    googleUrl: generateGoogleMapsUrl(trimmedName, trimmedAddress),
    placeId: entry.placeId,
    lat: entry.lat,
    lng: entry.lng,
    locationKey: entry.locationKey ?? null,
    district: entry.district ?? null,
    ianaTimeId: entry.ianaTimeId ?? null,
    phoneNumber: entry.phoneNumber ?? null,
    website: entry.website ?? null,
    priceLevel: entry.priceLevel ?? accommodationsHints?.price ?? null,
    operationHours,
    accommodationsHints,
    type: diningEnrichment.type,
    tripadvisorUrl: diningEnrichment.tripadvisorUrl,
    tripadvisorPlaceData: diningEnrichment.tripadvisorPlaceData,
    menuUrl: diningEnrichment.menuUrl,
    bookingUrl: diningEnrichment.bookingUrl,
    provenance,
  };
}
