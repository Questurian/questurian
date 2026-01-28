import { EnvConfig } from "../../config/env.config";

export interface TranslationStats {
  total: number;
  translated: number;
  already_english: number;
  errors: number;
  skipped: number;
}

export interface TranslateReviewsRequest {
  reviews: Record<string, unknown>[];
  fields_to_translate: string[];
  source_language?: string;
}

export interface TranslateReviewsResponse {
  reviews: Record<string, unknown>[];
  stats: TranslationStats;
  message: string;
}

export class TranslationApiClient {
  private readonly apiUrl: string;

  constructor(config: EnvConfig) {
    this.apiUrl = config.LEADS_API_URL;
  }

  isConfigured(): boolean {
    return !!this.apiUrl;
  }

  /**
   * Translate reviews using the Leads API translation service
   */
  async translateReviews(request: TranslateReviewsRequest): Promise<TranslateReviewsResponse> {
    const url = `${this.apiUrl}/translate/reviews`;

    console.log(`[Translation API] Translating ${request.reviews.length} reviews`);
    console.log(`[Translation API] Fields to translate: ${request.fields_to_translate.join(", ")}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reviews: request.reviews,
        fields_to_translate: request.fields_to_translate,
        source_language: request.source_language || "auto",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Translation API] Error response: ${response.status} - ${errorText}`);
      throw new Error(`Translation API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as TranslateReviewsResponse;
    console.log(`[Translation API] Response: ${data.message}`);

    return data;
  }
}
