import type { FetchReviewsResponse } from "./reviews.types";
import type { FetchTripAdvisorReviewsResponse } from "./tripadvisor.types";
import type { MergedReviewsStats, RejectsReportSummary } from "./merged-reviews.types";

export type ReviewSource = "google" | "tripadvisor";

export interface FetchReviewsPipelineRequest {
  sources: ReviewSource[];
}

export interface FetchReviewsPipelineWarning {
  source: ReviewSource;
  message: string;
}

export interface ReviewsPipelineResult {
  message: string;
  selectedSources: ReviewSource[];
  fetched: {
    google?: FetchReviewsResponse["data"];
    tripadvisor?: FetchTripAdvisorReviewsResponse["data"];
  };
  merged: {
    filename: string;
    stats: MergedReviewsStats;
    rejectsReport: RejectsReportSummary | null;
  };
  warnings: FetchReviewsPipelineWarning[] | null;
}

export type ReviewsPipelineStatus = "queued" | "running" | "completed" | "failed";

export type ReviewsPipelineStep =
  | "queued"
  | "fetching_google"
  | "fetching_tripadvisor"
  | "translating_merging"
  | "completed"
  | "failed";

export interface ReviewsPipelineJobStatus {
  jobId: string;
  status: ReviewsPipelineStatus;
  step: ReviewsPipelineStep;
  progress: number;
  message: string | null;
  warnings: FetchReviewsPipelineWarning[] | null;
  result: ReviewsPipelineResult | null;
  error: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface FetchReviewsPipelineStartResponse {
  success: true;
  data: {
    jobId: string;
    status: ReviewsPipelineStatus;
    step: ReviewsPipelineStep;
    progress: number;
    message: string | null;
  };
}

export interface FetchReviewsPipelineStatusResponse {
  success: true;
  data: ReviewsPipelineJobStatus;
}
