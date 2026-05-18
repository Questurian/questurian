export interface FetchTripAdvisorPlaceResponse {
  success: true;
  data: {
    message: string;
    locationId: number;
    tripadvisorPlaceId: string;
    fetchedAt: string;
    placeTitle: string | null;
    rating: number | null;
    reviewCount: number | null;
  };
}

export interface TripAdvisorPlaceStatusResponse {
  success: true;
  data: {
    hasPlaceData: boolean;
    source: "database" | "file" | null;
    fetchedAt: string | null;
    tripadvisorPlaceId: string | null;
    placeTitle: string | null;
    rating: number | null;
    reviewCount: number | null;
  };
}
