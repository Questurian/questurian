import { MIN_REVIEW_DATE_TIMESTAMP } from "../../../constants/translate-merge-reviews.constants";
import type { UnifiedReview } from "../../../types/translate-merge-reviews.types";
import {
  getReviewTimestamp,
  isReviewLongEnough,
} from "../../../utils/translate-merge-language.utils";
import type { FilterReviewsResult } from "./types";

export function dedupeAndFilterReviews(mergedReviews: UnifiedReview[]): FilterReviewsResult {
  const reviewsMap = new Map<string, UnifiedReview>();
  for (const review of mergedReviews) {
    if (!reviewsMap.has(review.id)) {
      reviewsMap.set(review.id, review);
    }
  }
  const uniqueReviews = Array.from(reviewsMap.values());

  console.log(`[Translate & Merge]   - After final dedup: ${uniqueReviews.length}`);
  if (mergedReviews.length !== uniqueReviews.length) {
    console.log(
      `[Translate & Merge]   WARNING: Lost ${mergedReviews.length - uniqueReviews.length} reviews in final dedup!`
    );
  }

  let filteredOutShort = 0;
  let filteredOutOld = 0;
  let filteredOutInvalidDate = 0;
  const filteredReviews: UnifiedReview[] = [];

  for (const review of uniqueReviews) {
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

    filteredReviews.push(review);
  }

  console.log(
    `[Translate & Merge] Filtered reviews: kept ${filteredReviews.length}/${uniqueReviews.length} (short: ${filteredOutShort}, old: ${filteredOutOld}, invalid date: ${filteredOutInvalidDate})`
  );
  if (filteredReviews.length === 0) {
    console.warn("[Translate & Merge] All reviews were filtered out by length/date criteria");
  }

  filteredReviews.sort((a, b) => {
    const dateA = a.review_datetime_utc ? new Date(a.review_datetime_utc).getTime() : 0;
    const dateB = b.review_datetime_utc ? new Date(b.review_datetime_utc).getTime() : 0;
    return dateB - dateA;
  });

  const finalGoogleCount = filteredReviews.filter((review) => review.source === "google").length;
  const finalTripAdvisorCount = filteredReviews.filter(
    (review) => review.source === "tripadvisor"
  ).length;
  const finalTranslatedCount = filteredReviews.filter((review) => review.was_translated).length;
  const finalAlreadyEnglishCount = filteredReviews.filter(
    (review) => !review.was_translated
  ).length;

  return {
    filteredReviews,
    filteredOutShort,
    filteredOutOld,
    filteredOutInvalidDate,
    finalGoogleCount,
    finalTripAdvisorCount,
    finalTranslatedCount,
    finalAlreadyEnglishCount,
  };
}
