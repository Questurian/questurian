import type {
  MinimalReview,
  RejectedReview,
  TranslateMergeRejectsReport,
  UnifiedReview,
} from "../../../types/translate-merge-reviews.types";

export function truncateText(value: string | null, max = 100): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function countRejectedByAction(
  rejectedReviews: RejectedReview[],
  action: RejectedReview["action"]
): number {
  return rejectedReviews.filter((review) => review.action === action).length;
}

export function buildRejectsSummary(
  locationId: number,
  timestamp: number,
  rejectedReviews: RejectedReview[]
): TranslateMergeRejectsReport {
  return {
    filename: `rejects_report_${locationId}_${timestamp}.json`,
    totalRejected: rejectedReviews.length,
    replacedWithEnglish: countRejectedByAction(rejectedReviews, "replaced_with_english"),
    rejectedNonEnglish: countRejectedByAction(rejectedReviews, "rejected_non_english"),
    translationFailed: countRejectedByAction(rejectedReviews, "translation_failed"),
  };
}

export function toMinimalReviews(reviews: UnifiedReview[]): MinimalReview[] {
  return reviews
    .filter((review) => review.review_text)
    .map((review) => ({
      text: review.review_text || "",
      rating: review.rating || 0,
      date: review.review_datetime_utc || "",
    }));
}
