import type { RejectedReview, UnifiedReview } from "../../../types/translate-merge-reviews.types";

export type TranslationRunStats = {
  googleReviews: number;
  tripadvisorReviews: number;
  needsTranslation: number;
  translated: number;
  alreadyEnglish: number;
  errors: number;
};

export type LoadSourceReviewsResult = {
  allReviews: UnifiedReview[];
  rejectedReviews: RejectedReview[];
  stats: TranslationRunStats;
};

export type TranslateReviewsResult = {
  mergedReviews: UnifiedReview[];
  stats: Pick<TranslationRunStats, "needsTranslation" | "alreadyEnglish" | "translated" | "errors">;
};

export type PrefilterReviewsResult = {
  kept: UnifiedReview[];
  filteredOutShort: number;
  filteredOutOld: number;
  filteredOutInvalidDate: number;
};

export type FilterReviewsResult = {
  filteredReviews: UnifiedReview[];
  finalGoogleCount: number;
  finalTripAdvisorCount: number;
  finalTranslatedCount: number;
  finalAlreadyEnglishCount: number;
};
