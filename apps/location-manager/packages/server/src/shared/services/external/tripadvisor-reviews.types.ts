/**
 * TripAdvisor Reviews API Response Types
 * Based on RapidAPI tripadvisor-scraper endpoint
 */

export interface TripAdvisorReviewsResponse {
  count: number;
  per_page: number;
  current_page: number;
  total_pages: number;
  next: string | null;
  previous: string | null;
  results: TripAdvisorReview[];
  rating_distribution: RatingDistribution;
  original_language_distribution: LanguageDistribution;
  translated_language_distribution: LanguageDistribution;
  review_keywords: string[];
  location: TripAdvisorLocation;
}

export interface TripAdvisorReview {
  review_id: number;
  review_link: string;
  title: string;
  text: string;
  review_tip: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  subratings: Subrating[];
  like_count: number;
  language: string;
  is_translated: boolean;
  original_language: string;
  owner_response: string | null;
  trip: Trip;
  reviewer: Reviewer;
  images: string[];
  created_at_date: string;
  published_at_date: string;
}

export interface Subrating {
  name: "value" | "service" | "food" | "atmosphere";
  label: "Value" | "Service" | "Food" | "Atmosphere";
  rating: 1 | 2 | 3 | 4 | 5;
}

export interface Trip {
  trip_type: "couples" | "family" | "friends" | "solo" | "business";
  stay_date: string;
}

export interface Reviewer {
  reviewer_id: string;
  name: string;
  profile_link: string;
  username: string;
  avatar: string | null;
  contribution_count: number;
  hometown: Hometown | null;
  is_verified: boolean;
}

export interface Hometown {
  tripadvisor_entity_id: number;
  location_name: string;
  location_name_detailed: string;
}

export interface RatingDistribution {
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
}

export interface LanguageDistribution {
  [languageCode: string]: LanguageInfo;
}

export interface LanguageInfo {
  language_name: string;
  reviews: number;
}

export interface TripAdvisorLocation {
  tripadvisor_entity_id: number;
  name: string;
  link: string;
  reviews: number;
  rating: number | null;
  place_type: string;
}

/**
 * Query parameters for the TripAdvisor Reviews API
 * Note: When using `lang`, only `query`, `page`, and `locale` can be specified
 */
export interface TripAdvisorQueryParams {
  /** TripAdvisor URL, numeric ID, or location name */
  query: string;
  /** Page number (1-indexed) */
  page?: number;
  /** Sort order for reviews */
  sort_by?: "most_recent" | "detailed_reviews";
  /** Filter by specific star ratings (comma-separated) */
  rating_is?: string;
  /** ISO date string (YYYY-MM-DD) - filter reviews since this date */
  since?: string;
  /** Filter by traveler type (comma-separated) */
  traveler_type?: string;
  /** Filter by months of visit (comma-separated) */
  months_of_visit?: string;
  /** Keyword to search in review title/body */
  keyword?: string;
  /** Language code to filter reviews by - ONE language per request */
  lang?: string;
  /** Locale for localization */
  locale?: string;
}

/**
 * Stored data structure for TripAdvisor reviews per language
 */
export interface StoredTripAdvisorReviewsData {
  fetchedAt: string;
  locationId: number;
  tripadvisorUrl: string;
  language: string;
  totalPages: number;
  totalReviews: number;
  reviews: TripAdvisorReview[];
  location: TripAdvisorLocation;
  rating_distribution: RatingDistribution;
}

/**
 * Fetch request DTO for TripAdvisor reviews
 */
export interface FetchTripAdvisorReviewsDto {
  /** Languages to fetch reviews for (will make separate requests per language) */
  languages: string[];
  /** Sort order for reviews */
  sort_by?: "most_recent" | "detailed_reviews";
  /** Locale for localization */
  locale?: string;
}

/**
 * Status response for TripAdvisor reviews
 */
export interface TripAdvisorReviewsStatus {
  hasReviews: boolean;
  languages: {
    language: string;
    reviewCount: number;
    fetchedAt: string;
  }[];
  totalReviews: number;
  rating: number | null;
  locationName: string | null;
}
