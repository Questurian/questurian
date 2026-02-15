import type { ReviewSource } from "../controllers/content/translate-merge-reviews.controller";

export interface FetchReviewsPipelineDto {
  sources?: ReviewSource[];
}

export interface FetchReviewsPipelineWarning {
  source: ReviewSource;
  message: string;
}

export interface FetchedGoogleReviewsResult {
  message: string;
  reviewCount: number;
  totalReviews: number;
  hasMore: boolean;
  fetchedAt: string;
}

export interface FetchedTripadvisorReviewsResult {
  message: string;
  languages: { language: string; reviewCount: number; filePath: string }[];
  totalReviews: number;
  locationName: string | null;
  rating: number | null;
}

export interface MergedReviewsResult {
  filename: string;
  stats: {
    totalReviews: number;
    googleReviews: number;
    tripadvisorReviews: number;
    translated: number;
    alreadyEnglish: number;
    errors: number;
  };
  rejectsReport: {
    filename: string;
    totalRejected: number;
    replacedWithEnglish: number;
    rejectedNonEnglish: number;
  } | null;
}

export interface PipelineResult {
  message: string;
  selectedSources: ReviewSource[];
  fetched: {
    google?: FetchedGoogleReviewsResult;
    tripadvisor?: FetchedTripadvisorReviewsResult;
  };
  merged: MergedReviewsResult;
  warnings: FetchReviewsPipelineWarning[] | null;
}

export type PipelineStatus = "queued" | "running" | "completed" | "failed";

export type PipelineStep =
  | "queued"
  | "fetching_google"
  | "fetching_tripadvisor"
  | "translating_merging"
  | "completed"
  | "failed";

export interface ReviewsPipelineJob {
  id: string;
  locationId: number;
  sources: ReviewSource[];
  status: PipelineStatus;
  step: PipelineStep;
  progress: number;
  message: string | null;
  warnings: FetchReviewsPipelineWarning[] | null;
  result: PipelineResult | null;
  error: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface PipelineProgressUpdate {
  step: PipelineStep;
  progress: number;
  message: string;
}

export interface PipelineDependencies {
  isGoogleConfigured: () => boolean;
  isTripadvisorConfigured: () => boolean;
  fetchGoogle: (
    locationId: number,
    location: { placeId: string }
  ) => Promise<FetchedGoogleReviewsResult>;
  fetchTripadvisor: (
    locationId: number,
    location: { tripadvisorUrl: string }
  ) => Promise<FetchedTripadvisorReviewsResult>;
  merge: (
    locationId: number,
    includeGoogle: boolean,
    includeTripadvisor: boolean
  ) => Promise<MergedReviewsResult>;
}

