import type { Context } from "hono";
import { randomUUID } from "node:crypto";
import { EnvConfig } from "@server/shared/config/env.config";
import { ReviewsApiClient, type ReviewsQueryParams, type StoredReviewsData } from "@server/shared/services/external/reviews-api.client";
import { TripAdvisorReviewsApiClient } from "@server/shared/services/external/tripadvisor-reviews-api.client";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse, errorResponse } from "@shared/types/api-response";
import { runTranslateAndMergeReviews, type ReviewSource } from "./translate-merge-reviews.controller";

const config = EnvConfig.getInstance();
const reviewsClient = new ReviewsApiClient(config);
const tripAdvisorClient = new TripAdvisorReviewsApiClient(config);
const container = ServiceContainer.getInstance();

const DEFAULT_GOOGLE_PARAMS: Omit<ReviewsQueryParams, "business_id"> = {
  limit: 99,
  translate_reviews: true,
  sort_by: "newest",
  region: "pe",
  language: "en",
};

const DEFAULT_TRIPADVISOR_LANGUAGES = ["en", "es"] as const;
const DEFAULT_TRIPADVISOR_SORT: "most_recent" | "detailed_reviews" = "most_recent";
const DEFAULT_TRIPADVISOR_LOCALE = "en-US";
const MAX_TRIPADVISOR_REVIEWS_PER_LANGUAGE = 150;

const JOB_TTL_MS = 1000 * 60 * 60; // 1 hour

interface FetchReviewsPipelineDto {
  sources?: ReviewSource[];
}

export interface FetchReviewsPipelineWarning {
  source: ReviewSource;
  message: string;
}

type RawReviewsData = {
  reviews_data?: unknown;
  reviews?: unknown;
  cursor?: string;
  next_cursor?: string;
  rating?: number;
  name?: string;
};

type RawReview = {
  review_text?: string | null;
  rating?: number;
  review_rating?: number;
  review_datetime_utc?: string;
  review_photos?: string[] | null;
};

type PipelineStatus = "queued" | "running" | "completed" | "failed";

type PipelineStep =
  | "queued"
  | "fetching_google"
  | "fetching_tripadvisor"
  | "translating_merging"
  | "completed"
  | "failed";

export interface PipelineResult {
  message: string;
  selectedSources: ReviewSource[];
  fetched: {
    google?: {
      message: string;
      reviewCount: number;
      totalReviews: number;
      hasMore: boolean;
      fetchedAt: string;
    };
    tripadvisor?: {
      message: string;
      languages: { language: string; reviewCount: number; filePath: string }[];
      totalReviews: number;
      locationName: string | null;
      rating: number | null;
    };
  };
  merged: {
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
  };
  warnings: FetchReviewsPipelineWarning[] | null;
}

interface ReviewsPipelineJob {
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

interface PipelineProgressUpdate {
  step: PipelineStep;
  progress: number;
  message: string;
}

interface PipelineDependencies {
  isGoogleConfigured: () => boolean;
  isTripadvisorConfigured: () => boolean;
  fetchGoogle: (locationId: number, location: { placeId: string }) => Promise<PipelineResult["fetched"]["google"]>;
  fetchTripadvisor: (locationId: number, location: { tripadvisorUrl: string }) => Promise<PipelineResult["fetched"]["tripadvisor"]>;
  merge: (locationId: number, includeGoogle: boolean, includeTripadvisor: boolean) => Promise<PipelineResult["merged"]>;
}

class PipelineExecutionError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

const JOBS = new Map<string, ReviewsPipelineJob>();

function nowIso() {
  return new Date().toISOString();
}

function createJob(locationId: number, sources: ReviewSource[]): ReviewsPipelineJob {
  const id = typeof randomUUID === "function"
    ? randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const job: ReviewsPipelineJob = {
    id,
    locationId,
    sources,
    status: "queued",
    step: "queued",
    progress: 0,
    message: null,
    warnings: null,
    result: null,
    error: null,
    startedAt: nowIso(),
    updatedAt: nowIso(),
  };

  JOBS.set(id, job);
  return job;
}

function updateJob(id: string, patch: Partial<ReviewsPipelineJob>) {
  const job = JOBS.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: nowIso() });
}

function finalizeJob(id: string) {
  setTimeout(() => {
    const job = JOBS.get(id);
    if (!job) return;
    JOBS.delete(id);
  }, JOB_TTL_MS).unref?.();
}

function getRawResponseData(storedData: StoredReviewsData): RawReviewsData {
  return storedData.response.data as RawReviewsData;
}

function getReviewsArray(storedData: StoredReviewsData): RawReview[] {
  const data = getRawResponseData(storedData);
  if (Array.isArray(data.reviews_data)) {
    return data.reviews_data as RawReview[];
  }
  if (Array.isArray(data.reviews)) {
    return data.reviews as RawReview[];
  }
  return [];
}

function getTotalReviews(storedData: StoredReviewsData): number {
  const data = getRawResponseData(storedData);
  if (Array.isArray(data.reviews)) {
    return data.reviews.length;
  }
  if (typeof data.reviews === "number") {
    return data.reviews;
  }
  return 0;
}

function hasMoreReviews(storedData: StoredReviewsData): boolean {
  const data = getRawResponseData(storedData);
  return Boolean(data.next_cursor ?? data.cursor);
}

function defaultDependencies(): PipelineDependencies {
  return {
    isGoogleConfigured: () => reviewsClient.isConfigured(),
    isTripadvisorConfigured: () => tripAdvisorClient.isConfigured(),
    fetchGoogle: async (locationId, location) => {
      const params: ReviewsQueryParams = {
        business_id: location.placeId,
        ...DEFAULT_GOOGLE_PARAMS,
      };
      const storedData = await reviewsClient.fetchAndSaveReviews(locationId, params);
      const reviewsArray = getReviewsArray(storedData);
      return {
        message: "Google reviews fetched and saved successfully",
        reviewCount: reviewsArray.length,
        totalReviews: getTotalReviews(storedData),
        hasMore: hasMoreReviews(storedData),
        fetchedAt: storedData.fetchedAt,
      };
    },
    fetchTripadvisor: async (locationId, location) => {
      const result = await tripAdvisorClient.fetchAndSaveReviewsForLanguages(
        locationId,
        location.tripadvisorUrl,
        [...DEFAULT_TRIPADVISOR_LANGUAGES],
        {
          sort_by: DEFAULT_TRIPADVISOR_SORT,
          locale: DEFAULT_TRIPADVISOR_LOCALE,
          maxReviews: MAX_TRIPADVISOR_REVIEWS_PER_LANGUAGE,
        }
      );

      return {
        message: "TripAdvisor reviews fetched and saved successfully",
        languages: result.languages,
        totalReviews: result.totalReviews,
        locationName: result.location?.name ?? null,
        rating: result.location?.rating ?? null,
      };
    },
    merge: async (locationId, includeGoogle, includeTripadvisor) => {
      const merged = await runTranslateAndMergeReviews(locationId, {
        includeGoogle,
        includeTripadvisor,
      });

      return {
        filename: merged.filename,
        stats: merged.stats,
        rejectsReport: merged.rejectsReport,
      };
    },
  };
}

export async function executePipeline(
  locationId: number,
  location: { placeId?: string | null; tripadvisorUrl?: string | null },
  sources: ReviewSource[],
  deps: PipelineDependencies,
  onProgress?: (update: PipelineProgressUpdate) => void
): Promise<PipelineResult> {
  const warnings: FetchReviewsPipelineWarning[] = [];
  const fetched: PipelineResult["fetched"] = {};

  const normalizedSources = new Set(sources.map((source) => source.toLowerCase()));
  const wantsGoogle = normalizedSources.has("google");
  const wantsTripadvisor = normalizedSources.has("tripadvisor");

  let googleFetched = false;
  let tripadvisorFetched = false;

  if (wantsGoogle) {
    onProgress?.({ step: "fetching_google", progress: 15, message: "Fetching Google reviews" });
    if (!deps.isGoogleConfigured()) {
      warnings.push({
        source: "google",
        message: "Google Reviews API not configured - RAPIDAPI_REVIEWS_KEY missing in .env",
      });
    } else if (!location.placeId) {
      warnings.push({
        source: "google",
        message: "Location does not have a Google Place ID. Please fetch the Place ID first.",
      });
    } else {
      try {
        fetched.google = await deps.fetchGoogle(locationId, { placeId: location.placeId });
        googleFetched = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch Google reviews";
        warnings.push({ source: "google", message });
      }
    }
  }

  if (wantsTripadvisor) {
    onProgress?.({ step: "fetching_tripadvisor", progress: 45, message: "Fetching TripAdvisor reviews" });
    if (!deps.isTripadvisorConfigured()) {
      warnings.push({
        source: "tripadvisor",
        message: "TripAdvisor Reviews API not configured - RAPIDAPI_TRIP_ADVISOR_REVIEWS_KEY missing in .env",
      });
    } else if (!location.tripadvisorUrl) {
      warnings.push({
        source: "tripadvisor",
        message: "Location does not have a TripAdvisor URL. Please add a TripAdvisor URL first.",
      });
    } else {
      try {
        fetched.tripadvisor = await deps.fetchTripadvisor(locationId, { tripadvisorUrl: location.tripadvisorUrl });
        tripadvisorFetched = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch TripAdvisor reviews";
        warnings.push({ source: "tripadvisor", message });
      }
    }
  }

  if (!googleFetched && !tripadvisorFetched) {
    const hasClientError = warnings.some((warning) =>
      warning.message.toLowerCase().includes("place id")
      || warning.message.toLowerCase().includes("tripadvisor url")
    );
    throw new PipelineExecutionError(
      "Failed to fetch reviews from selected sources.",
      hasClientError ? 400 : 500
    );
  }

  onProgress?.({ step: "translating_merging", progress: 80, message: "Translating and merging reviews" });

  const merged = await deps.merge(locationId, googleFetched, tripadvisorFetched);

  const fetchedLabels: string[] = [];
  if (googleFetched) {
    fetchedLabels.push(`Google (${fetched.google?.reviewCount ?? 0})`);
  }
  if (tripadvisorFetched) {
    fetchedLabels.push(`TripAdvisor (${fetched.tripadvisor?.totalReviews ?? 0})`);
  }

  let message = `Pipeline complete: ${fetchedLabels.join(" + ")} reviews fetched, ${merged.stats.totalReviews} merged.`;
  if (warnings.length > 0) {
    message += ` ${warnings.length} warning${warnings.length > 1 ? "s" : ""}.`;
  }

  return {
    message,
    selectedSources: sources,
    fetched,
    merged,
    warnings: warnings.length > 0 ? warnings : null,
  };
}

async function runPipelineJob(job: ReviewsPipelineJob, location: NonNullable<ReturnType<typeof container.locationQueryService.getLocationById>>) {
  updateJob(job.id, { status: "running", step: "fetching_google", progress: 5, message: "Preparing pipeline" });

  try {
    const result = await executePipeline(
      job.locationId,
      { placeId: location.placeId, tripadvisorUrl: location.tripadvisorUrl },
      job.sources,
      defaultDependencies(),
      (update) => updateJob(job.id, { ...update })
    );

    updateJob(job.id, {
      status: "completed",
      step: "completed",
      progress: 100,
      message: result.message,
      warnings: result.warnings,
      result,
    });
    finalizeJob(job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    const status = error instanceof PipelineExecutionError ? error.status : 500;

    updateJob(job.id, {
      status: "failed",
      step: "failed",
      progress: 100,
      error: message,
      message: status === 400 ? "Missing required data for selected sources" : "Pipeline failed",
    });
    finalizeJob(job.id);
  }
}

export async function fetchReviewsPipeline(c: Context) {
  const locationId = parseInt(c.req.param("id"));
  const location = container.locationQueryService.getLocationById(locationId);

  if (!location) {
    return c.json(errorResponse("Location not found"), 404);
  }

  const body = await c.req.json<FetchReviewsPipelineDto>().catch(() => ({} as FetchReviewsPipelineDto));
  const requestedSources = Array.isArray(body.sources) && body.sources.length > 0
    ? body.sources
    : ["tripadvisor"] as ReviewSource[];

  const normalizedSources = new Set(requestedSources.map((source) => source.toLowerCase()));
  const wantsGoogle = normalizedSources.has("google");
  const wantsTripadvisor = normalizedSources.has("tripadvisor");

  if (!wantsGoogle && !wantsTripadvisor) {
    return c.json(errorResponse("At least one source is required"), 400);
  }

  const job = createJob(locationId, requestedSources);

  runPipelineJob(job, location).catch((error) => {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    updateJob(job.id, {
      status: "failed",
      step: "failed",
      progress: 100,
      error: message,
      message,
    });
    finalizeJob(job.id);
  });

  return c.json(
    successResponse({
      jobId: job.id,
      status: job.status,
      step: job.step,
      progress: job.progress,
      message: job.message,
    })
  );
}

export async function getReviewsPipelineStatus(c: Context) {
  const locationId = parseInt(c.req.param("id"));
  const jobId = c.req.query("jobId");

  if (!jobId) {
    return c.json(errorResponse("jobId is required"), 400);
  }

  const job = JOBS.get(jobId);
  if (!job || job.locationId !== locationId) {
    return c.json(errorResponse("Pipeline job not found"), 404);
  }

  return c.json(
    successResponse({
      jobId: job.id,
      status: job.status,
      step: job.step,
      progress: job.progress,
      message: job.message,
      warnings: job.warnings,
      result: job.result,
      error: job.error,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
    })
  );
}
