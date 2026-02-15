export interface FetchTripAdvisorReviewsRequest {
  /** Languages to fetch reviews for (will make separate requests per language) */
  languages: string[];
  /** Sort order for reviews */
  sort_by?: "most_recent" | "detailed_reviews";
  /** Locale for localization */
  locale?: string;
}

export interface FetchTripAdvisorReviewsResponse {
  success: true;
  data: {
    message: string;
    languages: {
      language: string;
      reviewCount: number;
      filePath: string;
    }[];
    totalReviews: number;
    locationName: string | null;
    rating: number | null;
  };
}

export interface TripAdvisorReviewsStatusResponse {
  success: true;
  data: {
    hasReviews: boolean;
    languages: {
      language: string;
      reviewCount: number;
      fetchedAt: string;
    }[];
    totalReviews: number;
    rating: number | null;
    locationName: string | null;
  };
}

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
