/**
 * Geoapify API Client
 *
 * External API client for Geoapify reverse geocoding service.
 * Used to convert lat/lng coordinates into hierarchical location data for Brazil.
 */

export interface GeoapifyResponse {
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  region?: string;
  state?: string;
  state_code?: string;
  county?: string;
  city?: string;
  municipality?: string;
  postcode?: string;
  suburb?: string;      // Brazilian bairro (e.g., "Copacabana")
  district?: string;    // More granular (e.g., "Bairro Peixoto")
  street?: string;
  housenumber?: string;
  formatted?: string;
}

export class GeoapifyClient {
  private readonly baseUrl = "https://api.geoapify.com/v1/geocode/reverse";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Reverse geocode coordinates to location data
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @returns Geoapify API response with hierarchical location data
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<GeoapifyResponse> {
    if (!this.isConfigured()) {
      throw new Error("Geoapify API not configured - GEOAPIFY_API_KEY missing");
    }

    try {
      const url = `${this.baseUrl}?lat=${latitude}&lon=${longitude}&apiKey=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Geoapify API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;

      // Geoapify returns features array in GeoJSON FeatureCollection format
      if (data.features && data.features.length > 0) {
        return data.features[0].properties as GeoapifyResponse;
      }

      throw new Error("No results from Geoapify API");
    } catch (error) {
      console.error("[GeoapifyClient] Reverse geocoding failed:", error);
      throw error;
    }
  }
}
