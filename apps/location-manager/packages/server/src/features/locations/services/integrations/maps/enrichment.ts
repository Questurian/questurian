import type { LocationCategory } from "../../../models/location";
import type { TripadvisorPrefillFields } from "./maps.types";
import type { MapsService } from "../maps.service";
import type { AccommodationsApiHints } from "../clients/foursquare-api.client";
import { fetchPlaceTypes, mapGoogleTypesToDiningType } from "../google-dining-type";
import { extractTripadvisorPrefillFields } from "./tripadvisor-prefill";
import {
  extractTripadvisorLocationId,
  normalizeTripadvisorUrl,
} from "../../../utils/tripadvisor-utils";

export async function resolveDiningEnrichment(
  service: MapsService,
  category: LocationCategory | undefined,
  placeId: string,
  overrides?: {
    operatorTripadvisorUrl?: string;
    noTripadvisorListing?: boolean;
  }
): Promise<{
  type: string | null;
  tripadvisorUrl: string | null;
  tripadvisorUrlProvenance: "operator" | "tripadvisor";
  tripadvisorPlaceData: TripadvisorPrefillFields | null;
  menuUrl: string | null;
  bookingUrl: string | null;
}> {
  if (category !== "dining") {
    return {
      type: null,
      tripadvisorUrl: null,
      tripadvisorUrlProvenance: "tripadvisor",
      tripadvisorPlaceData: null,
      menuUrl: null,
      bookingUrl: null,
    };
  }

  const googleTypesPromise = (async () => {
    try {
      const types = await fetchPlaceTypes(placeId, service.config.GOOGLE_MAPS_API_KEY);
      return mapGoogleTypesToDiningType(types);
    } catch (error) {
      console.warn("[MapsService] Google types lookup failed:", error);
      return null;
    }
  })();

  const tripadvisor: {
    url: string | null;
    provenance: "operator" | "tripadvisor";
  } = overrides?.operatorTripadvisorUrl && !overrides.noTripadvisorListing
    ? {
        url: normalizeTripadvisorUrl(overrides.operatorTripadvisorUrl),
        provenance: "operator",
      }
    : { url: null, provenance: "tripadvisor" };

  const type = await googleTypesPromise;

  let tripadvisorPlaceData: TripadvisorPrefillFields | null = null;
  if (tripadvisor.url) {
    const tripadvisorLocationId = extractTripadvisorLocationId(tripadvisor.url);
    if (tripadvisorLocationId) {
      const placeResult = await service.tripAdvisorPlaceService.fetchPlaceDataForPrefill(
        tripadvisorLocationId
      );
      if (placeResult) {
        tripadvisorPlaceData = extractTripadvisorPrefillFields(placeResult);
      }
    }
  }

  return {
    type,
    tripadvisorUrl: tripadvisor.url,
    tripadvisorUrlProvenance: tripadvisor.provenance,
    tripadvisorPlaceData,
    menuUrl: null,
    bookingUrl: null,
  };
}

export async function resolveAccommodationsHints(
  service: MapsService,
  category: LocationCategory | undefined,
  name: string,
  address: string,
  lat?: number | null,
  lng?: number | null
): Promise<AccommodationsApiHints | null> {
  if (category !== "accommodations") return null;

  try {
    return await service.foursquareClient.getAccommodationsHints({
      name,
      address,
      lat,
      lng,
    });
  } catch (error) {
    console.warn("[MapsService] Foursquare accommodations enrichment failed:", error);
    return null;
  }
}
