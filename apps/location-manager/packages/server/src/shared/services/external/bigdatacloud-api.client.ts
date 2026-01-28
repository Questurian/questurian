/**
 * BigDataCloud API Client
 *
 * External API client for BigDataCloud reverse geocoding service.
 * Used to convert lat/lng coordinates into hierarchical location data.
 */

export interface AdministrativeLevel {
  name: string;
  description?: string;
  order?: number;
  adminLevel?: number;
  isoCode?: string;
  wikidataId?: string;
  geonameId?: number;
}

export interface InformativeLevel {
  name: string;
  description?: string;
  order?: number;
  isoName?: string;
  isoCode?: string;
  wikidataId?: string;
  geonameId?: number;
}

export interface BigDataCloudResponse {
  latitude: number;
  longitude: number;
  localityLanguage: string;
  continent?: string;
  continentCode?: string;
  countryName?: string;
  countryCode?: string;
  principalSubdivision?: string;
  principalSubdivisionCode?: string;
  city?: string;
  locality?: string;
  postcode?: string;
  plusCode?: string;
  localityInfo?: {
    administrative?: AdministrativeLevel[];
    informative?: InformativeLevel[];
  };
}

export class BigDataCloudClient {
  private readonly baseUrl = "https://api.bigdatacloud.net/data/reverse-geocode-client";

  /**
   * Reverse geocode coordinates to location data
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @returns BigDataCloud API response with hierarchical location data
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<BigDataCloudResponse> {
    try {
      const url = `${this.baseUrl}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`BigDataCloud API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as BigDataCloudResponse;
      return data;
    } catch (error) {
      console.error("[BigDataCloudClient] Reverse geocoding failed:", error);
      throw error;
    }
  }
}
