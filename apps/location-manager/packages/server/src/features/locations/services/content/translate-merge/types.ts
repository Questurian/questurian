import type {
  MergedReviewsGoogleSourceMeta,
  MergedReviewsTripadvisorSourceMeta,
  RejectedReview,
  UnifiedReview,
} from "../../../types/translate-merge-reviews.types";

export type TranslationRunStats = {
  googleReviews: number;
  tripadvisorReviews: number;
  needsTranslation: number;
  translated: number;
  alreadyEnglish: number;
  translationFailed: number;
  errors: number;
};

export type LoadSourceReviewsResult = {
  allReviews: UnifiedReview[];
  rejectedReviews: RejectedReview[];
  stats: TranslationRunStats;
  sourceMeta: {
    google: MergedReviewsGoogleSourceMeta;
    tripadvisor: MergedReviewsTripadvisorSourceMeta;
  };
};

export type TranslateReviewsResult = {
  mergedReviews: UnifiedReview[];
  failedRejects: RejectedReview[];
  stats: Pick<
    TranslationRunStats,
    "needsTranslation" | "alreadyEnglish" | "translated" | "translationFailed" | "errors"
  >;
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
