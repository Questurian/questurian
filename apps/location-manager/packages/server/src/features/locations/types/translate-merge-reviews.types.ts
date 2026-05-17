export type ReviewSource = "google" | "tripadvisor";

export interface UnifiedReview {
  id: string;
  source: ReviewSource;
  review_text: string | null;
  title: string | null;
  rating: number | null;
  review_datetime_utc: string | null;
  review_photos: string[] | null;
  original_language: string | null;
  was_translated: boolean;
  author_name: string | null;
}

export interface TranslateMergeOptions {
  includeGoogle?: boolean;
  includeTripadvisor?: boolean;
}

export interface TranslateMergeStats {
  totalReviews: number;
  googleReviews: number;
  tripadvisorReviews: number;
  translated: number;
  alreadyEnglish: number;
  translationFailed: number;
  errors: number;
}

export type MergedReviewsUnusableReason = "too_few_reviews";

export interface MergedReviewsUsability {
  unusable: boolean;
  unusableReason: MergedReviewsUnusableReason | null;
}

export interface TranslateMergeRejectsReport {
  filename: string;
  totalRejected: number;
  replacedWithEnglish: number;
  rejectedNonEnglish: number;
  translationFailed: number;
}

export interface TranslateMergeRejectsSummary {
  totalRejected: number;
  replacedWithEnglish: number;
  rejectedNonEnglish: number;
  translationFailed: number;
}

export interface TranslateMergeResult {
  message: string;
  filename: string;
  stats: TranslateMergeStats;
  usability: MergedReviewsUsability;
  rejectsReport: TranslateMergeRejectsReport | null;
}

export interface RejectedReviewVersion {
  language: string;
  title: string | null;
  review_text_preview: string | null;
  source_file: string;
}

export type RejectedReviewAction =
  | "rejected_non_english"
  | "replaced_with_english"
  | "translation_failed";

export interface RejectedReview {
  review_id: string;
  action: RejectedReviewAction;
  reason: string;
  kept: RejectedReviewVersion | null;
  rejected: RejectedReviewVersion;
}

export interface MergedReviewsGoogleSourceMeta {
  fetchedAt: string | null;
  fileFound: boolean;
  reviewCount: number;
}

export interface MergedReviewsTripadvisorSourceMeta {
  fetchedAt: string | null;
  fileCount: number;
  fileLoadErrors: number;
  reviewCountRaw: number;
  reviewCountUnique: number;
}

export interface MergedReviewsSourceMeta {
  google: MergedReviewsGoogleSourceMeta;
  tripadvisor: MergedReviewsTripadvisorSourceMeta;
}

export interface MergedReviewsPipelineFilters {
  minChars: number;
  minReviewDate: string;
}

export interface MergedReviewsPipelineMeta {
  translatorVersion: string;
  filters: MergedReviewsPipelineFilters;
  schemaVersion: number;
}

export const MERGED_REVIEWS_SCHEMA_VERSION = 1;

export interface MergedReviewsFile {
  locationId: number;
  mergedAt: string;
  stats: TranslateMergeStats;
  usability: MergedReviewsUsability;
  reviews: UnifiedReview[];
  // Fields below were introduced with schemaVersion=1. They are optional on read
  // for back-compat with pre-schemaVersion files, and always written on new merges.
  contentHash?: string;
  sources?: MergedReviewsSourceMeta;
  pipeline?: MergedReviewsPipelineMeta;
}

export interface RejectsReportFile {
  locationId: number;
  generatedAt: string;
  summary: {
    totalRejected: number;
    replacedWithEnglish: number;
    rejectedNonEnglish: number;
    translationFailed: number;
  };
  explanation: {
    why: string;
    whatWeDo: string;
    actions: {
      replaced_with_english: string;
      rejected_non_english: string;
      translation_failed: string;
    };
  };
  rejectedReviews: RejectedReview[];
}

export interface MinimalReview {
  text: string;
  rating: number;
  date: string;
}

export interface ReviewFileReference {
  filename: string;
  filepath: string;
}

export interface MergedReviewsDownloadPayload {
  filename: string;
  content: string;
}

export interface MergedReviewsReportPayload {
  locationId: number;
  mergedAt: string;
  stats: TranslateMergeStats;
  usability: MergedReviewsUsability;
  rejectsReport: TranslateMergeRejectsSummary | null;
}

export interface MergedReviewsStatusPayload {
  hasMergedReviews: boolean;
  filename: string | null;
  mergedAt: string | null;
  stats: TranslateMergeStats | null;
  usability: MergedReviewsUsability | null;
}
