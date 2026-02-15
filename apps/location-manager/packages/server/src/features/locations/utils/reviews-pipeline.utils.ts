import type { StoredReviewsData } from "../services/integrations/clients/reviews-api.client";

type RawReviewsData = {
  reviews_data?: unknown;
  reviews?: unknown;
  cursor?: string;
  next_cursor?: string;
};

type RawReview = {
  review_text?: string | null;
  rating?: number;
  review_rating?: number;
  review_datetime_utc?: string;
  review_photos?: string[] | null;
};

export function nowIso() {
  return new Date().toISOString();
}

export function getRawResponseData(storedData: StoredReviewsData): RawReviewsData {
  return storedData.response.data as RawReviewsData;
}

export function getReviewsArray(storedData: StoredReviewsData): RawReview[] {
  const data = getRawResponseData(storedData);
  if (Array.isArray(data.reviews_data)) {
    return data.reviews_data as RawReview[];
  }
  if (Array.isArray(data.reviews)) {
    return data.reviews as RawReview[];
  }
  return [];
}

export function getTotalReviews(storedData: StoredReviewsData): number {
  const data = getRawResponseData(storedData);
  if (Array.isArray(data.reviews)) {
    return data.reviews.length;
  }
  if (typeof data.reviews === "number") {
    return data.reviews;
  }
  return 0;
}

export function hasMoreReviews(storedData: StoredReviewsData): boolean {
  const data = getRawResponseData(storedData);
  return Boolean(data.next_cursor ?? data.cursor);
}

