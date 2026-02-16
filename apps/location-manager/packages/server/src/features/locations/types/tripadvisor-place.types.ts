import type { MinimalReview } from "./translate-merge-reviews.types";

export interface AiJsonPayload {
  id: number;
  name: string | null;
  district: string | null;
  neighborhoodDescription: string | null;
  description: string | null;
  reviews_summary: string | null;
  meal_types: string[] | null;
  cuisines: string[] | null;
  features: string[] | null;
  reviews: MinimalReview[];
}

export interface FetchTripAdvisorPlacePayload {
  message: string;
  locationId: number;
  tripadvisorPlaceId: string;
  fetchedAt: string;
  placeTitle: string | null;
  rating: number | null;
  reviewCount: number | null;
}

export interface JsonDownloadPayload {
  filename: string;
  content: string;
}

export interface TripAdvisorPlaceStatusPayload {
  hasPlaceData: boolean;
  source: "database" | "file" | null;
  fetchedAt: string | null;
  tripadvisorPlaceId: string | null;
  placeTitle: string | null;
  rating: number | null;
  reviewCount: number | null;
}
