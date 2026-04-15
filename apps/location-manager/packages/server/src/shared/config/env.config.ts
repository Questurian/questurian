export class EnvConfig {
  private static instance: EnvConfig;

  readonly GOOGLE_MAPS_API_KEY: string;
  readonly RAPID_API_KEY: string;
  readonly RAPIDAPI_REVIEWS_KEY: string;
  readonly RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY: string;
  readonly GEOAPIFY_API_KEY: string;
  readonly BIGDATACLOUD_API_KEY: string;
  readonly SERPAPI_KEY: string;
  readonly PAYLOAD_API_URL: string;
  readonly PAYLOAD_SERVICE_EMAIL: string;
  readonly PAYLOAD_SERVICE_PASSWORD: string;
  readonly ALT_TEXT_API_URL: string;
  readonly LEADS_API_URL: string;
  readonly PORT: number;
  readonly NODE_ENV: string;

  private constructor() {
    this.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
    this.RAPID_API_KEY = process.env.RAPID_API_KEY || "";
    this.RAPIDAPI_REVIEWS_KEY = process.env.RAPIDAPI_REVIEWS_KEY || "";
    this.RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY = process.env.RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY || "";
    this.GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || "";
    this.BIGDATACLOUD_API_KEY = process.env.BIGDATACLOUD_API_KEY || "";
    this.SERPAPI_KEY = process.env.SERPAPI_KEY || "";
    this.PAYLOAD_API_URL = process.env.PAYLOAD_API_URL || "";
    this.PAYLOAD_SERVICE_EMAIL = process.env.PAYLOAD_SERVICE_EMAIL || "";
    this.PAYLOAD_SERVICE_PASSWORD = process.env.PAYLOAD_SERVICE_PASSWORD || "";
    this.ALT_TEXT_API_URL = process.env.ALT_TEXT_API_URL || "http://localhost:8642";
    this.LEADS_API_URL = process.env.LEADS_API_URL || "http://localhost:4004";
    this.PORT = Number(process.env.PORT || 4317);
    this.NODE_ENV = process.env.NODE_ENV || "development";

    this.validate();
  }

  static getInstance(): EnvConfig {
    if (!EnvConfig.instance) {
      EnvConfig.instance = new EnvConfig();
    }
    return EnvConfig.instance;
  }

  private validate(): void {
    const warnings: string[] = [];

    if (!this.GOOGLE_MAPS_API_KEY) {
      warnings.push("GOOGLE_MAPS_API_KEY not set - geocoding disabled");
    }

    if (!this.RAPID_API_KEY) {
      warnings.push("RAPID_API_KEY not set - Instagram media download disabled");
    }

    if (!this.RAPIDAPI_REVIEWS_KEY) {
      warnings.push("RAPIDAPI_REVIEWS_KEY not set - Google Reviews fetch disabled");
    }

    if (!this.RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY) {
      warnings.push("RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY not set - TripAdvisor Reviews fetch disabled");
    }

    if (!this.GEOAPIFY_API_KEY) {
      warnings.push("GEOAPIFY_API_KEY not set - Brazil reverse geocoding may fail");
    }

    if (!this.BIGDATACLOUD_API_KEY) {
      warnings.push("BIGDATACLOUD_API_KEY not set - timezone lookup may fail");
    }

    if (!this.SERPAPI_KEY) {
      warnings.push("SERPAPI_KEY not set - TripAdvisor place data fetch disabled");
    }

    if (!this.PAYLOAD_API_URL || !this.PAYLOAD_SERVICE_EMAIL || !this.PAYLOAD_SERVICE_PASSWORD) {
      warnings.push("Payload CMS not configured - sync to Payload disabled");
    }

    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      warnings.push("GOOGLE_CLOUD_PROJECT not set - Vertex AI not configured (alt text and neighborhood descriptions will fail)");
    }

    // LEADS_API_URL defaults to localhost for review translation

    if (warnings.length > 0 && this.NODE_ENV !== "test") {
      console.warn("Configuration warnings:", warnings.join(", "));
    }
  }

  hasGoogleMapsKey(): boolean {
    return !!this.GOOGLE_MAPS_API_KEY;
  }

  hasRapidApiKey(): boolean {
    return !!this.RAPID_API_KEY;
  }

  hasReviewsApiKey(): boolean {
    return !!this.RAPIDAPI_REVIEWS_KEY;
  }

  hasTripAdvisorReviewsApiKey(): boolean {
    return !!this.RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY;
  }

  hasGeoapifyKey(): boolean {
    return !!this.GEOAPIFY_API_KEY;
  }

  hasBigDataCloudKey(): boolean {
    return !!this.BIGDATACLOUD_API_KEY;
  }

  hasSerpApiKey(): boolean {
    return !!this.SERPAPI_KEY;
  }

  isPayloadConfigured(): boolean {
    return !!(this.PAYLOAD_API_URL && this.PAYLOAD_SERVICE_EMAIL && this.PAYLOAD_SERVICE_PASSWORD);
  }

  get altTextApiUrl(): string {
    return this.ALT_TEXT_API_URL;
  }
}
