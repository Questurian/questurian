import { EnvConfig } from "../../config/env.config";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export interface ReviewsQueryParams {
  business_id: string;
  limit?: number;
  cursor?: string;
  translate_reviews?: boolean;
  query?: string;
  sort_by?: "most_relevant" | "newest" | "highest_ranking" | "lowest_ranking";
  fields?: string;
  region?: string;
  language?: string;
}

export interface ReviewAuthor {
  name: string;
  link?: string;
  thumbnail?: string;
  local_guide?: boolean;
  reviews?: number;
  photos?: number;
}

export interface Review {
  review_id: string;
  review_link?: string;
  review_rating: number;
  review_timestamp: number;
  review_datetime_utc: string;
  review_text?: string;
  review_photos?: string[];
  review_likes?: number;
  response_text?: string;
  response_timestamp?: number;
  response_datetime_utc?: string;
  author: ReviewAuthor;
}

export interface ReviewsApiResponse {
  status: string;
  request_id: string;
  data: {
    name: string;
    address: string;
    business_id: string;
    place_id: string;
    rating: number;
    reviews: number;
    reviews_per_rating: {
      "1": number;
      "2": number;
      "3": number;
      "4": number;
      "5": number;
    };
    reviews_data: Review[];
    next_cursor?: string;
  };
}

export interface StoredReviewsData {
  fetchedAt: string;
  locationId: number;
  placeId: string;
  queryParams: ReviewsQueryParams;
  response: ReviewsApiResponse;
}

export class ReviewsApiClient {
  private readonly apiKey: string;
  private readonly apiHost = "local-business-data.p.rapidapi.com";
  private readonly dataDir: string;

  constructor(config: EnvConfig) {
    this.apiKey = config.RAPIDAPI_REVIEWS_KEY;
    this.dataDir = path.join(process.cwd(), "data", "reviews");
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async ensureDataDir(): Promise<void> {
    if (!existsSync(this.dataDir)) {
      await mkdir(this.dataDir, { recursive: true });
    }
  }

  async fetchReviews(params: ReviewsQueryParams): Promise<ReviewsApiResponse> {
    if (!this.isConfigured()) {
      throw new Error("Reviews API not configured - RAPIDAPI_REVIEWS_KEY missing");
    }

    const queryParams = new URLSearchParams();
    queryParams.set("business_id", params.business_id);

    if (params.limit !== undefined) {
      queryParams.set("limit", String(params.limit));
    }
    if (params.cursor) {
      queryParams.set("cursor", params.cursor);
    }
    if (params.translate_reviews !== undefined) {
      queryParams.set("translate_reviews", String(params.translate_reviews));
    }
    if (params.query) {
      queryParams.set("query", params.query);
    }
    if (params.sort_by) {
      queryParams.set("sort_by", params.sort_by);
    }
    if (params.fields) {
      queryParams.set("fields", params.fields);
    }
    if (params.region) {
      queryParams.set("region", params.region);
    }
    if (params.language) {
      queryParams.set("language", params.language);
    }

    const url = `https://${this.apiHost}/business-reviews-v2?${queryParams.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": this.apiHost,
        "x-rapidapi-key": this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Reviews API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<ReviewsApiResponse>;
  }

  async fetchAndSaveReviews(
    locationId: number,
    params: ReviewsQueryParams
  ): Promise<StoredReviewsData> {
    await this.ensureDataDir();

    const response = await this.fetchReviews(params);

    const storedData: StoredReviewsData = {
      fetchedAt: new Date().toISOString(),
      locationId,
      placeId: params.business_id,
      queryParams: params,
      response,
    };

    const filename = `reviews_location_${locationId}_${Date.now()}.json`;
    const filepath = path.join(this.dataDir, filename);

    await Bun.write(filepath, JSON.stringify(storedData, null, 2));

    return storedData;
  }

  async getLatestReviewsFile(locationId: number): Promise<string | null> {
    await this.ensureDataDir();

    if (!existsSync(this.dataDir)) {
      return null;
    }

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(this.dataDir);

    const locationFiles = files
      .filter((f: string) => f.startsWith(`reviews_location_${locationId}_`) && f.endsWith(".json"))
      .sort()
      .reverse();

    if (locationFiles.length === 0) {
      return null;
    }

    return path.join(this.dataDir, locationFiles[0]!);
  }

  async getReviewsData(locationId: number): Promise<StoredReviewsData | null> {
    const filepath = await this.getLatestReviewsFile(locationId);

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

  getReviewsFilePath(locationId: number): string {
    return path.join(this.dataDir, `reviews_location_${locationId}_*.json`);
  }
}
