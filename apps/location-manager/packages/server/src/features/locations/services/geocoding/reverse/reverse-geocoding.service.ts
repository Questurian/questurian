import { slugifyLocationPart } from "../location-key.utils";

export type ReverseGeocodedLocation = {
  countryName: string;
  countryCode: string;
  city: string;
  district: string | null;
  locality: string;
  locationKey: string;
};

export async function reverseGeocodeWithBigDataCloud(
  latitude: number,
  longitude: number,
  countryCode?: string
): Promise<ReverseGeocodedLocation | null> {
  try {
    const { ServiceContainer } = await import("@server/features/locations/container/service-container");
    const container = ServiceContainer.getInstance();
    const data = await container.bigDataCloudClient.reverseGeocode(latitude, longitude);
    const district = container.districtExtractionService.extractDistrict(
      countryCode || data.countryCode,
      data.localityInfo?.administrative || [],
      data.localityInfo?.informative
    );
    const locationParts = [
      slugifyLocationPart(data.countryName),
      slugifyLocationPart(data.city),
      slugifyLocationPart(district),
    ].filter(Boolean) as string[];

    return {
      countryName: data.countryName || "",
      countryCode: data.countryCode || "",
      city: data.city || "",
      district,
      locality: data.locality || "",
      locationKey: locationParts.length ? locationParts.join("|") : "",
    };
  } catch (error) {
    console.error("Error fetching BigDataCloud reverse geocoding:", error);
    return null;
  }
}

async function reverseGeocodeWithGeoapify(
  latitude: number,
  longitude: number,
  countryCode?: string
): Promise<ReverseGeocodedLocation | null> {
  try {
    const { ServiceContainer } = await import("@server/features/locations/container/service-container");
    const container = ServiceContainer.getInstance();
    if (!container.geoapifyClient.isConfigured()) return null;

    const data = await container.geoapifyClient.reverseGeocode(latitude, longitude);
    const city = data.city || data.state || "";
    const resolvedCode = (countryCode || data.country_code || "").toUpperCase();
    const district = resolvedCode === "MX"
      ? (data.district || data.suburb || null)
      : (data.suburb || null);
    const locationParts = [
      slugifyLocationPart(data.country),
      slugifyLocationPart(city),
      slugifyLocationPart(district),
    ].filter(Boolean) as string[];

    return {
      countryName: data.country || "",
      countryCode: data.country_code?.toUpperCase() || countryCode?.toUpperCase() || "",
      city,
      district,
      locality: data.suburb || "",
      locationKey: locationParts.length ? locationParts.join("|") : "",
    };
  } catch (error) {
    console.error("Error fetching Geoapify reverse geocoding:", error);
    return null;
  }
}

export async function reverseGeocodeWithRouting(
  latitude: number,
  longitude: number,
  countryCode?: string
): Promise<ReverseGeocodedLocation | null> {
  const routedCountryCode = countryCode?.toUpperCase();
  if (routedCountryCode === "BR" || routedCountryCode === "MX") {
    return reverseGeocodeWithGeoapify(latitude, longitude, countryCode);
  }
  return reverseGeocodeWithBigDataCloud(latitude, longitude, countryCode);
}

export async function fetchTimezoneIanaTimeId(
  latitude: number,
  longitude: number
): Promise<string | null> {
  try {
    const { ServiceContainer } = await import("@server/features/locations/container/service-container");
    const container = ServiceContainer.getInstance();
    const timezone = await container.bigDataCloudClient.getTimezone(latitude, longitude);
    return timezone.ianaTimeId || null;
  } catch (error) {
    console.error("Error fetching BigDataCloud timezone:", error);
    return null;
  }
}
