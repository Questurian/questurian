import type { Location, LocationCategory } from "../../models/location";
import { BadRequestError } from "@server/shared/core/errors/http-error";
import { geocode } from "./google/geocoding.client";
import { generateGoogleMapsUrl } from "./google/maps-url.utils";
import { normalizeGoogleOpeningHours } from "./google/opening-hours.utils";
import { getPlaceDetails } from "./google/place-details.client";
import { slugifyLocationPart } from "./location-key.utils";
import { fetchTimezoneIanaTimeId, reverseGeocodeWithRouting } from "./reverse/reverse-geocoding.service";

const APPROVED_COUNTRIES = ["PE", "CO", "BR", "MX", "AR", "CL", "PA"] as const;

export async function createFromMaps(
  name: string,
  address: string,
  apiKey?: string,
  category: LocationCategory = "attractions",
  type?: string,
  options?: { includeOperationHours?: boolean }
): Promise<Location> {
  const entry: Location = {
    name,
    title: name,
    address,
    url: generateGoogleMapsUrl(name, address),
    lat: null,
    lng: null,
    category,
    type: type || null,
    locationKey: null,
    placeId: null,
    ianaTimeId: null,
  };

  if (!apiKey) return entry;

  try {
    const coords = await geocode(address, apiKey);
    if (coords) {
      entry.lat = coords.lat;
      entry.lng = coords.lng;

      if (coords.countryCode) {
        const normalizedCode = coords.countryCode.toUpperCase();
        if (!APPROVED_COUNTRIES.includes(normalizedCode as typeof APPROVED_COUNTRIES[number])) {
          throw new BadRequestError(
            "Location not allowed. Only Peru, Colombia, Brazil, Mexico, Argentina, Chile, and Panama are supported."
          );
        }
        entry.countryCode = coords.countryCode;
      }

      const reverseGeoData = await reverseGeocodeWithRouting(coords.lat, coords.lng, coords.countryCode);
      if (reverseGeoData) {
        const isMexico = coords.countryCode?.toUpperCase() === "MX";
        if (isMexico && coords.sublocality) {
          const locationParts = [
            slugifyLocationPart(reverseGeoData.countryName),
            slugifyLocationPart(reverseGeoData.city),
            slugifyLocationPart(coords.sublocality),
          ].filter(Boolean);
          entry.locationKey = locationParts.join("|");
          entry.district = coords.sublocality;
        } else {
          if (reverseGeoData.locationKey) entry.locationKey = reverseGeoData.locationKey;
          if (reverseGeoData.district) entry.district = reverseGeoData.district;
        }
      }

      const ianaTimeId = await fetchTimezoneIanaTimeId(coords.lat, coords.lng);
      if (ianaTimeId) entry.ianaTimeId = ianaTimeId;
    }

    const placeDetails = await getPlaceDetails(name, address, apiKey);
    if (placeDetails) {
      if (placeDetails.name && placeDetails.name !== name) {
        entry.name = placeDetails.name;
        entry.title = placeDetails.name;
      }
      if (placeDetails.website) entry.website = placeDetails.website;
      if (placeDetails.international_phone_number) {
        entry.phoneNumber = placeDetails.international_phone_number;
      } else if (placeDetails.formatted_phone_number) {
        entry.phoneNumber = placeDetails.formatted_phone_number;
      }
      if (options?.includeOperationHours && placeDetails.opening_hours) {
        const operationHours = normalizeGoogleOpeningHours(placeDetails.opening_hours);
        if (operationHours) entry.hoursJson = JSON.stringify(operationHours);
      }
      if (placeDetails.place_id) entry.placeId = placeDetails.place_id;
      if (typeof placeDetails.price_level === "number" && placeDetails.price_level >= 1) {
        entry.priceLevel = "$".repeat(Math.min(placeDetails.price_level, 4));
      }
    }
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
  }

  return entry;
}
