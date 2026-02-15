import { EnvConfig } from "../../config/env.config";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { filterTripadvisorFeatures } from "@server/features/locations/utils/tripadvisor-utils";

export interface SerpApiTripAdvisorParams {
  place_id: string;
}

export interface TripAdvisorPlaceResult {
  title?: string;
  name?: string;
  rating?: number;
  price_range?: string;
  price_level?: string;
  description?: string;
  phone?: string;
  website?: string;
  email?: string;
  neighborhood?: string;
  neighborhood_description?: string;
  operation_hours?: Record<string, unknown>;
  hours?: Record<string, string>;
  meal_types?: string[];
  mealtypes?: string[];
  cuisines?: string[];
  dining_options?: string[];
  features?: string[];
  top_tags?: Array<{
    text: string;
    count?: number;
  }>;
  awards?: string[];
  review_summary?: {
    excellent?: number;
    very_good?: number;
    average?: number;
    poor?: number;
    terrible?: number;
  };
  [key: string]: unknown;
}

export interface SerpApiTripAdvisorResponse {
  search_metadata?: {
    id: string;
    status: string;
    json_endpoint?: string;
    created_at?: string;
    processed_at?: string;
    total_time_taken?: number;
  };
  search_parameters?: {
    engine: string;
    place_id: string;
  };
  place_result?: TripAdvisorPlaceResult;
  error?: string;
}

export interface StoredTripAdvisorPlaceData {
  fetchedAt: string;
  locationId: number;
  tripadvisorPlaceId: string;
  placeResult: TripAdvisorPlaceResult;
}

// Map TripAdvisor price level category names to app enum values ($, $$, $$$, $$$$)
const TRIPADVISOR_PRICE_LEVEL_MAP: Record<string, string> = {
  "Cheap Eats": "$",
  "Mid-range": "$$",
  "Fine Dining": "$$$$",
};

// Fields to exclude from the place_result response
const EXCLUDED_FIELDS = [
  "related_stories",
  "restaurant_suggestions",
  "reviews",
  "review_list",
  "reviews_list",
  "nearby",
  "nearby_restaurants",
  "nearby_hotels",
  "nearby_attractions",
  "also_viewed",
  "serpapi_pagination",
  "categories",
  "ranking",
  "is_claimed",
  "type",
  "images",
  "address",
  "address_link",
  "dining_options",
  "diets",
  "special_diets",
  "reviews_highlights",
];

export class SerpApiTripAdvisorClient {
  private readonly apiKey: string;
  private readonly baseUrl = "https://serpapi.com/search";
  private readonly dataDir: string;

  constructor(config: EnvConfig) {
    this.apiKey = config.SERPAPI_KEY;
    this.dataDir = path.join(process.cwd(), "data", "tripadvisor-places");
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Filter out unwanted fields from place_result
   */
  private filterPlaceResult(placeResult: TripAdvisorPlaceResult): TripAdvisorPlaceResult {
    const filtered: TripAdvisorPlaceResult = {};

    for (const [key, value] of Object.entries(placeResult)) {
      if (!EXCLUDED_FIELDS.includes(key)) {
        filtered[key] = value;
      }
    }

    // Extract price level from categories before they are excluded
    if (Array.isArray(placeResult.categories)) {
      const priceCat = placeResult.categories.find(
        (cat: { name?: string }) => typeof cat.name === "string" && cat.name in TRIPADVISOR_PRICE_LEVEL_MAP
      );
      if (priceCat && typeof priceCat.name === "string") {
        filtered.price_level = TRIPADVISOR_PRICE_LEVEL_MAP[priceCat.name]!;
      }
    }

    // Normalize aliases to keep a stable schema while preserving filtered payload size.
    const mealTypes =
      this.normalizeStringArray(placeResult.meal_types) ??
      this.normalizeStringArray(placeResult.mealtypes);
    if (mealTypes) {
      filtered.meal_types = mealTypes;
    }

    const cuisines = this.normalizeStringArray(placeResult.cuisines);
    if (cuisines) {
      filtered.cuisines = cuisines;
    }

    // Some TripAdvisor places expose "Features" as dining_options.
    const hasRawFeatures = Array.isArray(placeResult.features) || Array.isArray(placeResult.dining_options);
    const rawFeatures =
      this.normalizeStringArray(placeResult.features) ??
      this.normalizeStringArray(placeResult.dining_options);
    if (hasRawFeatures) {
      filtered.features = filterTripadvisorFeatures(rawFeatures ?? []) ?? [];
    }

    return filtered;
  }

  private normalizeStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const normalized = value
      .map((item) => {
        if (typeof item === "string") {
          const trimmed = item.trim();
          return trimmed.length > 0 ? trimmed : null;
        }

        if (item && typeof item === "object") {
          const text = (item as { text?: unknown }).text;
          if (typeof text === "string" && text.trim().length > 0) {
            return text.trim();
          }

          const name = (item as { name?: unknown }).name;
          if (typeof name === "string" && name.trim().length > 0) {
            return name.trim();
          }
        }

        return null;
      })
      .filter((item): item is string => item !== null);

    if (normalized.length === 0) {
      return null;
    }

    return Array.from(new Set(normalized));
  }

  private async ensureDataDir(): Promise<void> {
    if (!existsSync(this.dataDir)) {
      await mkdir(this.dataDir, { recursive: true });
    }
  }

  async fetchPlaceData(placeId: string): Promise<SerpApiTripAdvisorResponse> {
    if (!this.isConfigured()) {
      throw new Error("SerpAPI not configured - SERPAPI_KEY missing");
    }

    const queryParams = new URLSearchParams();
    queryParams.set("engine", "tripadvisor_place");
    queryParams.set("place_id", placeId);
    queryParams.set("api_key", this.apiKey);

    const url = `${this.baseUrl}?${queryParams.toString()}`;

    const response = await fetch(url, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SerpAPI error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<SerpApiTripAdvisorResponse>;
  }

  async fetchAndSavePlaceData(
    locationId: number,
    tripadvisorPlaceId: string
  ): Promise<StoredTripAdvisorPlaceData> {
    await this.ensureDataDir();

    const response = await this.fetchPlaceData(tripadvisorPlaceId);

    if (response.error) {
      throw new Error(`SerpAPI returned error: ${response.error}`);
    }

    if (!response.place_result) {
      throw new Error("SerpAPI response missing place_result");
    }

    // Filter out unwanted fields
    const filteredPlaceResult = this.filterPlaceResult(response.place_result);

    const storedData: StoredTripAdvisorPlaceData = {
      fetchedAt: new Date().toISOString(),
      locationId,
      tripadvisorPlaceId,
      placeResult: filteredPlaceResult,
    };

    const filename = `tripadvisor_place_${locationId}_${Date.now()}.json`;
    const filepath = path.join(this.dataDir, filename);

    await Bun.write(filepath, JSON.stringify(storedData, null, 2));

    return storedData;
  }

  async getLatestPlaceFile(locationId: number): Promise<string | null> {
    await this.ensureDataDir();

    if (!existsSync(this.dataDir)) {
      return null;
    }

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(this.dataDir);

    const locationFiles = files
      .filter((f: string) => f.startsWith(`tripadvisor_place_${locationId}_`) && f.endsWith(".json"))
      .sort()
      .reverse();

    if (locationFiles.length === 0) {
      return null;
    }

    return path.join(this.dataDir, locationFiles[0]!);
  }

  async getPlaceData(locationId: number): Promise<StoredTripAdvisorPlaceData | null> {
    const filepath = await this.getLatestPlaceFile(locationId);

    if (!filepath) {
      return null;
    }

    const file = Bun.file(filepath);
    if (!(await file.exists())) {
      return null;
    }

    const content = await file.text();
    return JSON.parse(content);
  }

  getPlaceFilePath(locationId: number): string {
    return path.join(this.dataDir, `tripadvisor_place_${locationId}_*.json`);
  }
}
