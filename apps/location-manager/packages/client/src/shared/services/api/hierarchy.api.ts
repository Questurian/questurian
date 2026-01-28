/**
 * Location hierarchy API
 */

import { apiGet } from "./client";
import { API_ENDPOINTS } from "./config";
import type {
  LocationHierarchyResponse,
  CountriesResponse,
  CitiesResponse,
  NeighborhoodsResponse,
} from "./types";

// ============================================================================
// LOCATION HIERARCHY
// ============================================================================

export const hierarchyApi = {
  /**
   * Get all location hierarchy data
   */
  async getAllHierarchy(): Promise<LocationHierarchyResponse> {
    return apiGet<LocationHierarchyResponse>(API_ENDPOINTS.HIERARCHY);
  },

  /**
   * Get all countries with their cities and neighborhoods
   */
  async getCountries(): Promise<CountriesResponse> {
    return apiGet<CountriesResponse>(API_ENDPOINTS.COUNTRIES);
  },

  /**
   * Get cities for a specific country
   */
  async getCitiesByCountry(country: string): Promise<CitiesResponse> {
    return apiGet<CitiesResponse>(API_ENDPOINTS.CITIES(country));
  },

  /**
   * Get neighborhoods for a specific country and city
   */
  async getNeighborhoods(
    country: string,
    city: string
  ): Promise<NeighborhoodsResponse> {
    return apiGet<NeighborhoodsResponse>(
      API_ENDPOINTS.NEIGHBORHOODS(country, city)
    );
  },
};
