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
