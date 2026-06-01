import type { GoogleOpeningHours } from "./opening-hours.utils";

export interface PlaceDetailsResult {
  name?: string;
  formatted_address?: string;
  website?: string;
  international_phone_number?: string;
  formatted_phone_number?: string;
  place_id?: string;
  price_level?: number;
  opening_hours?: GoogleOpeningHours;
}

interface PlacesApiResponse {
  status: string;
  results?: Array<{ place_id: string }>;
  result?: PlaceDetailsResult;
}

export async function getPlaceDetails(
  name: string,
  address: string,
  apiKey?: string
): Promise<PlaceDetailsResult | null> {
  if (!apiKey) return null;

  try {
    const query = `${name}, ${address}`;
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json() as PlacesApiResponse;

    if (searchData.status !== "OK" || !searchData.results?.length) return null;

    const placeId = searchData.results[0]!.place_id;
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,website,international_phone_number,formatted_phone_number,price_level,opening_hours&key=${apiKey}`;
    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json() as PlacesApiResponse;

    if (detailsData.status !== "OK" || !detailsData.result) return null;
    return { ...detailsData.result, place_id: placeId };
  } catch (error) {
    console.error("Error fetching place details:", error);
    return null;
  }
}
