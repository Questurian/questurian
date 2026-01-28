import { EnvConfig } from "../../config/env.config";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  TripAdvisorReviewsResponse,
  TripAdvisorQueryParams,
  StoredTripAdvisorReviewsData,
  TripAdvisorReview,
  TripAdvisorReviewsStatus,
} from "./tripadvisor-reviews.types";

export class TripAdvisorReviewsApiClient {
  private readonly apiKey: string;
  private readonly apiHost = "tripadvisor-scraper.p.rapidapi.com";
  private readonly dataDir: string;

  constructor(config: EnvConfig) {
    this.apiKey = config.RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY;
    this.dataDir = path.join(process.cwd(), "data", "tripadvisor-reviews");
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async ensureDataDir(): Promise<void> {
    if (!existsSync(this.dataDir)) {
      await mkdir(this.dataDir, { recursive: true });
    }
  }

  /**
   * Fetch a single page of reviews for a specific language
   */
  async fetchReviewsPage(params: TripAdvisorQueryParams): Promise<TripAdvisorReviewsResponse> {
    if (!this.isConfigured()) {
      console.error("[TripAdvisor] API key not configured. Check RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY in .env");
      throw new Error("TripAdvisor Reviews API not configured - RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY missing");
    }

    console.log(`[TripAdvisor] API key present: ${this.apiKey ? "Yes (length: " + this.apiKey.length + ")" : "No"}`);
    console.log(`[TripAdvisor] Query param: ${params.query}`);

    const queryParams = new URLSearchParams();
    queryParams.set("query", params.query);

    if (params.page !== undefined) {
      queryParams.set("page", String(params.page));
    }

    // When using 'lang' filter, only 'query', 'page', and 'locale' are allowed
    // Cannot use sort_by, rating_is, traveler_type, etc. with lang
    if (params.lang) {
      queryParams.set("lang", params.lang);
      if (params.locale) {
        queryParams.set("locale", params.locale);
      }
    } else {
      // Only add these params when NOT filtering by language
      if (params.sort_by) {
        queryParams.set("sort_by", params.sort_by);
      }
      if (params.locale) {
        queryParams.set("locale", params.locale);
      }
    }

    const url = `https://${this.apiHost}/reviews?${queryParams.toString()}`;

    console.log(`[TripAdvisor API] Fetching: ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": this.apiHost,
        "x-rapidapi-key": this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TripAdvisor API] Error response: ${response.status} - ${errorText}`);
      throw new Error(`TripAdvisor Reviews API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as TripAdvisorReviewsResponse;
    console.log(`[TripAdvisor API] Response: ${data.count} total reviews, page ${data.current_page}/${data.total_pages}`);

    return data;
  }

  /**
   * Fetch all pages of reviews for a single language
   * Continues fetching until current_page === total_pages or next === null
   */
  async fetchAllReviewsForLanguage(
    query: string,
    language: string,
    options: {
      sort_by?: "most_recent" | "detailed_reviews";
      locale?: string;
      maxReviews?: number;
    } = {}
  ): Promise<{
    reviews: TripAdvisorReview[];
    totalPages: number;
    totalReviews: number;
    location: TripAdvisorReviewsResponse["location"];
    rating_distribution: TripAdvisorReviewsResponse["rating_distribution"];
  }> {
    const allReviews: TripAdvisorReview[] = [];
    let currentPage = 1;
    let totalPages = 1;
    let totalAvailableReviews = 0;
    let location: TripAdvisorReviewsResponse["location"] | null = null;
    let rating_distribution: TripAdvisorReviewsResponse["rating_distribution"] | null = null;

    while (true) {
      console.log(`Fetching TripAdvisor reviews - language: ${language}, page: ${currentPage}/${totalPages}`);

      const response = await this.fetchReviewsPage({
        query,
        page: currentPage,
        lang: language,
        sort_by: options.sort_by,
        locale: options.locale,
      });

      // Store metadata from first page
      if (currentPage === 1) {
        location = response.location;
        rating_distribution = response.rating_distribution;
        totalAvailableReviews = response.count;
      }

      // Update total pages from response
      totalPages = response.total_pages;

      // Add reviews from this page
      allReviews.push(...response.results);

      console.log(
        `  Fetched ${response.results.length} reviews (total so far: ${allReviews.length}/${totalAvailableReviews})`
      );

      const maxReviews = options.maxReviews ?? 15;
      if (maxReviews > 0 && allReviews.length >= maxReviews) {
        console.log(`  Reached maxReviews cap (${maxReviews}) for language ${language}, stopping early.`);
        break;
      }

      // Check if we've reached the last page
      if (response.current_page >= response.total_pages || response.next === null) {
        break;
      }

      currentPage++;

      // Small delay to be respectful to the API
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return {
      reviews: allReviews,
      totalPages,
      totalReviews: allReviews.length,
      location: location!,
      rating_distribution: rating_distribution!,
    };
  }

  /**
   * Fetch reviews for multiple languages and save each as a separate file
   * Returns data about what was fetched
   */
  async fetchAndSaveReviewsForLanguages(
    locationId: number,
    tripadvisorUrl: string,
    languages: string[],
    options: {
      sort_by?: "most_recent" | "detailed_reviews";
      locale?: string;
      maxReviews?: number;
    } = {}
  ): Promise<{
    languages: { language: string; reviewCount: number; filePath: string }[];
    totalReviews: number;
    location: TripAdvisorReviewsResponse["location"] | null;
  }> {
    await this.ensureDataDir();

    const results: { language: string; reviewCount: number; filePath: string }[] = [];
    let totalReviews = 0;
    let location: TripAdvisorReviewsResponse["location"] | null = null;

    // Build the query - use the TripAdvisor URL directly
    const query = tripadvisorUrl;

    const errors: string[] = [];

    for (const language of languages) {
      try {
        console.log(`\n[TripAdvisor] Fetching all reviews for language: ${language}, query: ${query}`);

        const languageData = await this.fetchAllReviewsForLanguage(query, language, options);

        // Store location from first successful fetch
        if (!location && languageData.location) {
          location = languageData.location;
        }

        // Save the data for this language
        const storedData: StoredTripAdvisorReviewsData = {
          fetchedAt: new Date().toISOString(),
          locationId,
          tripadvisorUrl,
          language,
          totalPages: languageData.totalPages,
          totalReviews: languageData.totalReviews,
          reviews: languageData.reviews,
          location: languageData.location,
          rating_distribution: languageData.rating_distribution,
        };

        const filename = `tripadvisor_reviews_${locationId}_${language}_${Date.now()}.json`;
        const filepath = path.join(this.dataDir, filename);

        await Bun.write(filepath, JSON.stringify(storedData, null, 2));

        results.push({
          language,
          reviewCount: languageData.reviews.length,
          filePath: filepath,
        });

        totalReviews += languageData.reviews.length;

        console.log(`Saved ${languageData.reviews.length} reviews for language ${language}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`[TripAdvisor] Error fetching reviews for language ${language}:`);
        console.error(`  Message: ${errorMessage}`);
        if (errorStack) console.error(`  Stack: ${errorStack}`);
        errors.push(`${language}: ${errorMessage}`);
        // Continue with other languages even if one fails, but track the error
      }
    }

    // If no languages were successfully fetched and we have languages to fetch, throw an error
    if (results.length === 0 && languages.length > 0) {
      const errorDetails = errors.length > 0 ? ` Errors: ${errors.join("; ")}` : "";
      throw new Error(`Failed to fetch reviews for any of the requested languages.${errorDetails}`);
    }

    return {
      languages: results,
      totalReviews,
      location,
    };
  }

  /**
   * Get the latest reviews file for a location and language
   */
  async getLatestReviewsFile(locationId: number, language: string): Promise<string | null> {
    await this.ensureDataDir();

    if (!existsSync(this.dataDir)) {
      return null;
    }

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(this.dataDir);

    const locationFiles = files
      .filter(
        (f: string) =>
          f.startsWith(`tripadvisor_reviews_${locationId}_${language}_`) && f.endsWith(".json")
      )
      .sort()
      .reverse();

    if (locationFiles.length === 0) {
      return null;
    }

    return path.join(this.dataDir, locationFiles[0]!);
  }

  /**
   * Get all language files for a location
   */
  async getAllLanguageFiles(locationId: number): Promise<string[]> {
    await this.ensureDataDir();

    if (!existsSync(this.dataDir)) {
      return [];
    }

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(this.dataDir);

    // Group by language and get the latest for each
    const languageLatest = new Map<string, { file: string; timestamp: number }>();

    for (const file of files) {
      if (!file.startsWith(`tripadvisor_reviews_${locationId}_`) || !file.endsWith(".json")) {
        continue;
      }

      // Parse: tripadvisor_reviews_{locationId}_{language}_{timestamp}.json
      const match = file.match(/^tripadvisor_reviews_\d+_([a-z]+)_(\d+)\.json$/);
      if (!match) continue;

      const language = match[1]!;
      const timestamp = parseInt(match[2]!, 10);

      const existing = languageLatest.get(language);
      if (!existing || timestamp > existing.timestamp) {
        languageLatest.set(language, { file, timestamp });
      }
    }

    return Array.from(languageLatest.values()).map((v) => path.join(this.dataDir, v.file));
  }

  /**
   * Get reviews data for a specific language
   */
  async getReviewsData(locationId: number, language: string): Promise<StoredTripAdvisorReviewsData | null> {
    const filepath = await this.getLatestReviewsFile(locationId, language);

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

  /**
   * Get status of all TripAdvisor reviews for a location
   */
  async getReviewsStatus(locationId: number): Promise<TripAdvisorReviewsStatus> {
    const files = await this.getAllLanguageFiles(locationId);

    if (files.length === 0) {
      return {
        hasReviews: false,
        languages: [],
        totalReviews: 0,
        rating: null,
        locationName: null,
      };
    }

    const languages: TripAdvisorReviewsStatus["languages"] = [];
    let totalReviews = 0;
    let rating: number | null = null;
    let locationName: string | null = null;

    for (const filepath of files) {
      const file = Bun.file(filepath);
      if (!(await file.exists())) continue;

      const content = await file.text();
      const data: StoredTripAdvisorReviewsData = JSON.parse(content);

      languages.push({
        language: data.language,
        reviewCount: data.reviews.length,
        fetchedAt: data.fetchedAt,
      });

      totalReviews += data.reviews.length;

      // Get rating and location name from first file
      if (rating === null && data.location?.rating) {
        rating = data.location.rating;
      }
      if (locationName === null && data.location?.name) {
        locationName = data.location.name;
      }
    }

    return {
      hasReviews: languages.length > 0,
      languages,
      totalReviews,
      rating,
      locationName,
    };
  }
}
