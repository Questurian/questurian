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
  errors: number;
}

export interface TranslateMergeRejectsReport {
  filename: string;
  totalRejected: number;
  replacedWithEnglish: number;
  rejectedNonEnglish: number;
}

export interface TranslateMergeRejectsSummary {
  totalRejected: number;
  replacedWithEnglish: number;
  rejectedNonEnglish: number;
}

export interface TranslateMergeResult {
  message: string;
  filename: string;
  stats: TranslateMergeStats;
  rejectsReport: TranslateMergeRejectsReport | null;
}

export interface RejectedReviewVersion {
  language: string;
  title: string | null;
  review_text_preview: string | null;
  source_file: string;
}

export interface RejectedReview {
  review_id: string;
  action: "rejected_non_english" | "replaced_with_english";
  reason: string;
  kept: RejectedReviewVersion;
  rejected: RejectedReviewVersion;
}

export interface MergedReviewsFile {
  locationId: number;
  mergedAt: string;
  stats: TranslateMergeStats;
  reviews: UnifiedReview[];
}

export interface RejectsReportFile {
  locationId: number;
  generatedAt: string;
  summary: {
    totalRejected: number;
    replacedWithEnglish: number;
    rejectedNonEnglish: number;
  };
  explanation: {
    why: string;
    whatWeDo: string;
    actions: {
      replaced_with_english: string;
      rejected_non_english: string;
    };
  };
  rejectedReviews: RejectedReview[];
}

export interface MinimalReview {
  text: string;
  rating: number;
  date: string;
}

export interface Review2BlogExportReview {
  reviewId: string;
  source: ReviewSource;
  date: string;
  rating: number;
  text: string;
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
  rejectsReport: TranslateMergeRejectsSummary | null;
}

export interface MergedReviewsStatusPayload {
  hasMergedReviews: boolean;
  filename: string | null;
  mergedAt: string | null;
  stats: TranslateMergeStats | null;
}
