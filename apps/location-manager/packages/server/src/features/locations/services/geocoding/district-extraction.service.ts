import type { AdministrativeLevel, InformativeLevel } from "@server/shared/services/external/bigdatacloud-api.client";

type CountryCode = string;
type AdminLevel = number;

/**
 * District Extraction Service
 *
 * Provides country-specific logic for extracting district/neighborhood data
 * from BigDataCloud reverse geocoding API responses.
 *
 * Different countries use different administrative level hierarchies:
 * - Peru: Districts at adminLevel 8
 * - Colombia: Districts at adminLevel 8
 * - Brazil: Tourism zones from informative array, fallback to adminLevel 8
 */
export class DistrictExtractionService {
  private readonly adminLevelMapping: Map<CountryCode, AdminLevel[]>;

  // Brazil tourism zone mappings (case-insensitive partial matching)
  private readonly brazilZoneMappings: Map<string, string> = new Map([
    ["south zone", "Zona Sul"],
    ["zona sul", "Zona Sul"],
    ["sul", "Zona Sul"],
    ["north zone", "Zona Norte"],
    ["zona norte", "Zona Norte"],
    ["norte", "Zona Norte"],
    ["west zone", "Zona Oeste"],
    ["zona oeste", "Zona Oeste"],
    ["oeste", "Zona Oeste"],
    ["centro", "Centro"],
    ["central zone", "Centro"],
    ["center", "Centro"],
    ["downtown", "Centro"],
    ["ilhas", "Ilhas"],
    ["islands", "Ilhas"],
  ]);

  constructor() {
    // Country-specific admin level configurations
    // Array allows fallback chain: try first level, if not found try second, etc.
    this.adminLevelMapping = new Map([
      ["PE", [8]], // Peru: adminLevel 8 (districts like Miraflores, Barranco)
      ["CO", [8]], // Colombia: adminLevel 8 (districts like Chapinero, Santa Fe)
      ["BR", [10, 8]], // Brazil: adminLevel 10 (bairros like Grajau), fallback to 8 (municipality)
      // Add more countries as needed
    ]);
  }

  /**
   * Extract district from BigDataCloud administrative data based on country
   * @param countryCode - ISO 2-letter country code (e.g., 'PE', 'CO', 'BR')
   * @param administrative - Administrative levels from BigDataCloud API
   * @param informative - Informative levels from BigDataCloud API (optional, used for Brazil zones)
   * @returns District name or null if not found
   */
  extractDistrict(
    countryCode: string | undefined,
    administrative: AdministrativeLevel[],
    informative?: InformativeLevel[]
  ): string | null {
    if (!administrative || administrative.length === 0) {
      return null;
    }

    // Case 1: No country code - use default adminLevel 8 (current behavior)
    if (!countryCode) {
      return this.extractByAdminLevel(administrative, 8);
    }

    // Normalize country code to uppercase
    const normalizedCode = countryCode.toUpperCase();

    // Special handling for Brazil: prioritize tourism zones from informative array
    if (normalizedCode === "BR") {
      return this.extractBrazilDistrict(administrative, informative);
    }

    // Case 2: Country not in mapping - use default adminLevel 8
    const adminLevels = this.adminLevelMapping.get(normalizedCode);
    if (!adminLevels || adminLevels.length === 0) {
      return this.extractByAdminLevel(administrative, 8);
    }

    // Case 3: Try each adminLevel in order (fallback chain)
    for (const level of adminLevels) {
      const district = this.extractByAdminLevel(administrative, level);
      if (district) {
        return district;
      }
    }

    // Case 4: No match found at any configured level
    return null;
  }

  /**
   * Extract Brazil district with tourism zone priority
   * @param administrative - Administrative levels array
   * @param informative - Informative levels array (contains tourism zones)
   * @returns Tourism zone or bairro name, or null
   */
  private extractBrazilDistrict(
    administrative: AdministrativeLevel[],
    informative?: InformativeLevel[]
  ): string | null {
    // Priority 1: Try to extract tourism zone from informative array
    if (informative && informative.length > 0) {
      const zone = this.extractBrazilTourismZone(informative);
      if (zone) {
        return zone;
      }
    }

    // Priority 2: Fallback to bairro from adminLevel 10 (neighborhood level in Brazil)
    const bairro = this.extractByAdminLevel(administrative, 10);
    if (bairro) {
      return bairro;
    }

    // Priority 3: Final fallback to adminLevel 8 (municipality level)
    const municipality = this.extractByAdminLevel(administrative, 8);
    if (municipality) {
      return municipality;
    }

    return null;
  }

  /**
   * Extract and normalize Brazil tourism zone from informative array
   * @param informative - Informative levels array
   * @returns Normalized zone name (Zona Sul, Zona Norte, etc.) or null
   */
  private extractBrazilTourismZone(
    informative: InformativeLevel[]
  ): string | null {
    for (const item of informative) {
      if (!item.name) continue;

      const nameLower = item.name.toLowerCase();

      // Try exact and partial matches against known zone patterns
      for (const [pattern, normalizedZone] of this.brazilZoneMappings.entries()) {
        if (nameLower.includes(pattern)) {
          return normalizedZone;
        }
      }
    }

    return null;
  }

  /**
   * Extract district by specific admin level
   * @param administrative - Administrative levels array
   * @param targetLevel - Target admin level to search for
   * @returns District name or null
   */
  private extractByAdminLevel(
    administrative: AdministrativeLevel[],
    targetLevel: number
  ): string | null {
    const match = administrative.find((item) => item.adminLevel === targetLevel);
    return match?.name || null;
  }

  /**
   * Add or update country-specific admin level mapping
   * Future enhancement: Load from database
   * @param countryCode - ISO 2-letter country code
   * @param adminLevels - Array of admin levels to try (in order)
   */
  setCountryMapping(countryCode: string, adminLevels: number[]): void {
    this.adminLevelMapping.set(countryCode.toUpperCase(), adminLevels);
  }

  /**
   * Get all configured country mappings (for debugging/admin)
   */
  getAllMappings(): Record<string, number[]> {
    const result: Record<string, number[]> = {};
    this.adminLevelMapping.forEach((levels, code) => {
      result[code] = levels;
    });
    return result;
  }
}
