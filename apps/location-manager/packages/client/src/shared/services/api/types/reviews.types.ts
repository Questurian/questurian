export interface FetchReviewsRequest {
  limit?: number;
  cursor?: string;
  translate_reviews?: boolean;
  query?: string;
  sort_by?: "most_relevant" | "newest" | "highest_ranking" | "lowest_ranking";
  fields?: string;
  region?: string;
  language?: string;
}

export interface FetchReviewsResponse {
  success: true;
  data: {
    message: string;
    reviewCount: number;
    totalReviews: number;
    hasMore: boolean;
    fetchedAt: string;
  };
}

export interface ReviewsStatusResponse {
  success: true;
  data: {
    hasReviews: boolean;
    fetchedAt: string | null;
    reviewCount: number;
    totalReviews?: number;
    rating?: number;
    businessName?: string;
  };
}
