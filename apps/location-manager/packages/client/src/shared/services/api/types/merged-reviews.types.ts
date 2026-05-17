export interface MergedReviewsStats {
  totalReviews: number;
  googleReviews: number;
  tripadvisorReviews: number;
  translated: number;
  alreadyEnglish: number;
  translationFailed: number;
  errors: number;
}

export interface RejectsReportSummary {
  filename: string;
  totalRejected: number;
  replacedWithEnglish: number;
  rejectedNonEnglish: number;
  translationFailed: number;
}

export interface TranslateMergeReviewsResponse {
  success: true;
  data: {
    message: string;
    filename: string;
    stats: MergedReviewsStats;
    rejectsReport: RejectsReportSummary | null;
  };
}

export interface MergedReviewsStatusResponse {
  success: true;
  data: {
    hasMergedReviews: boolean;
    filename: string | null;
    mergedAt: string | null;
    stats: MergedReviewsStats | null;
  };
}

export interface MergedReviewsReportData {
  locationId: number;
  mergedAt: string;
  stats: MergedReviewsStats;
  rejectsReport: {
    totalRejected: number;
    replacedWithEnglish: number;
    rejectedNonEnglish: number;
    translationFailed: number;
  } | null;
}

export interface MergedReviewsReportResponse {
  success: true;
  data: MergedReviewsReportData;
}
