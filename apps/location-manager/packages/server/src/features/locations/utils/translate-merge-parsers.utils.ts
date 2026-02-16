import type { UnifiedReview } from "../types/translate-merge-reviews.types";

export function parseGoogleReviews(data: unknown): UnifiedReview[] {
  const storedData = data as {
    response?: {
      data?: {
        reviews?: Array<{
          review_id?: string;
          review_text?: string | null;
          rating?: number;
          review_rating?: number;
          review_datetime_utc?: string;
          review_photos?: string[] | null;
          review_language?: string;
          author_name?: string;
        }>;
        reviews_data?: Array<{
          review_id?: string;
          review_text?: string | null;
          rating?: number;
          review_rating?: number;
          review_datetime_utc?: string;
          review_photos?: string[] | null;
          review_language?: string;
          author_name?: string;
        }>;
      };
    };
  };

  const reviews = storedData.response?.data?.reviews
    || storedData.response?.data?.reviews_data
    || [];

  return reviews.map((review) => ({
    id: review.review_id || `google_${Date.now()}_${Math.random()}`,
    source: "google",
    review_text: review.review_text ?? null,
    title: null,
    rating: review.rating ?? review.review_rating ?? null,
    review_datetime_utc: review.review_datetime_utc ?? null,
    review_photos: Array.isArray(review.review_photos) ? review.review_photos : null,
    original_language: review.review_language ?? null,
    was_translated: false,
    author_name: review.author_name ?? null,
  }));
}

export function parseTripAdvisorReviews(data: unknown): UnifiedReview[] {
  const storedData = data as {
    language?: string;
    reviews?: Array<{
      review_id?: number;
      title?: string;
      text?: string;
      rating?: number;
      published_at_date?: string;
      images?: string[];
      language?: string;
      original_language?: string;
      is_translated?: boolean;
      reviewer?: {
        name?: string;
      };
    }>;
  };

  const reviews = storedData.reviews || [];
  const fileLanguage = storedData.language || "en";

  return reviews.map((review) => ({
    id: review.review_id ? `tripadvisor_${review.review_id}` : `tripadvisor_${Date.now()}_${Math.random()}`,
    source: "tripadvisor",
    review_text: review.text ?? null,
    title: review.title ?? null,
    rating: review.rating ?? null,
    review_datetime_utc: review.published_at_date ?? null,
    review_photos: Array.isArray(review.images) && review.images.length > 0 ? review.images : null,
    original_language: review.language || fileLanguage,
    was_translated: false,
    author_name: review.reviewer?.name ?? null,
  }));
}
