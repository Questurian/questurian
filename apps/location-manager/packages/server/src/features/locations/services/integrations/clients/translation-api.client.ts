import { EnvConfig } from "@server/shared/config/env.config";

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
}

export interface TranslateReviewsResponse {
  reviews: Record<string, unknown>[];
  stats: TranslationStats;
  message: string;
}

export class TranslationApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "TranslationApiError";
  }
}

export class TranslationApiClient {
  private readonly apiUrl: string;

  constructor(config: EnvConfig) {
    this.apiUrl = config.altTextApiUrl;
  }

  isConfigured(): boolean {
    return !!this.apiUrl;
  }

  /**
   * Translate reviews via the python-alt-text Vertex-backed translation endpoint.
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Translation API] Error response: ${response.status} - ${errorText}`);
      throw new TranslationApiError(
        response.status,
        `Translation API error: ${response.status} - ${errorText}`
      );
    }

    const data = (await response.json()) as TranslateReviewsResponse;
    console.log(`[Translation API] Response: ${data.message}`);

    return data;
  }
}
