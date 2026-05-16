import { MIN_REVIEW_DATE_TIMESTAMP } from "../../../constants/translate-merge-reviews.constants";
import type { UnifiedReview } from "../../../types/translate-merge-reviews.types";
import {
  getReviewTimestamp,
  isReviewLongEnough,
} from "../../../utils/translate-merge-language.utils";
import type { FilterReviewsResult, PrefilterReviewsResult } from "./types";

export function prefilterByLengthAndDate(reviews: UnifiedReview[]): PrefilterReviewsResult {
  let filteredOutShort = 0;
  let filteredOutOld = 0;
  let filteredOutInvalidDate = 0;
  const kept: UnifiedReview[] = [];

  for (const review of reviews) {
    if (!isReviewLongEnough(review)) {
      filteredOutShort += 1;
      continue;
    }

    const timestamp = getReviewTimestamp(review);
    if (timestamp === null) {
      filteredOutInvalidDate += 1;
      continue;
    }

    if (timestamp < MIN_REVIEW_DATE_TIMESTAMP) {
      filteredOutOld += 1;
      continue;
    }

    kept.push(review);
  }

  return { kept, filteredOutShort, filteredOutOld, filteredOutInvalidDate };
}

export function sortAndCount(mergedReviews: UnifiedReview[]): FilterReviewsResult {
  const sorted = [...mergedReviews].sort((a, b) => {
    const dateA = a.review_datetime_utc ? new Date(a.review_datetime_utc).getTime() : 0;
    const dateB = b.review_datetime_utc ? new Date(b.review_datetime_utc).getTime() : 0;
    return dateB - dateA;
  });

  const finalGoogleCount = sorted.filter((review) => review.source === "google").length;
  const finalTripAdvisorCount = sorted.filter((review) => review.source === "tripadvisor").length;
  const finalTranslatedCount = sorted.filter((review) => review.was_translated).length;
  const finalAlreadyEnglishCount = sorted.filter((review) => !review.was_translated).length;

  return {
    filteredReviews: sorted,
    finalGoogleCount,
    finalTripAdvisorCount,
    finalTranslatedCount,
    finalAlreadyEnglishCount,
  };
}
