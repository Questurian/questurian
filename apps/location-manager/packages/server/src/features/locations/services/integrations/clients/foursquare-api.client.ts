import { EnvConfig } from "@server/shared/config/env.config";
import { mapFoursquarePlaceToAccommodationsHints } from "./foursquare-accommodations.mapper";
import type {
  AccommodationsApiHints,
  FoursquareAccommodationsLookupInput,
  FoursquarePlace,
} from "./foursquare.types";

const FOURSQUARE_PLACE_FIELDS = [
  "fsq_id",
  "name",
  "description",
  "price",
  "categories",
  "features",
  "tastes",
].join(",");

export class FoursquareApiClient {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.foursquare.com/v3";

  constructor(config: EnvConfig) {
    this.apiKey = config.FOURSQUARE_API_KEY || "";
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async getAccommodationsHints(
    input: FoursquareAccommodationsLookupInput
  ): Promise<AccommodationsApiHints | null> {
    if (!this.isConfigured()) return null;

    const url = new URL(`${this.baseUrl}/places/match`);
    url.searchParams.set("name", input.name);
    url.searchParams.set("address", input.address);
    url.searchParams.set("fields", FOURSQUARE_PLACE_FIELDS);

    if (typeof input.lat === "number" && typeof input.lng === "number") {
      url.searchParams.set("ll", `${input.lat},${input.lng}`);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: this.apiKey,
        "X-Places-Api-Version": "1970-01-01",
      },
    });

    if (response.status === 404) return null;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Foursquare API error: ${response.status} - ${errorText}`);
    }

    const place = (await response.json()) as FoursquarePlace;
    return mapFoursquarePlaceToAccommodationsHints(place);
  }
}
