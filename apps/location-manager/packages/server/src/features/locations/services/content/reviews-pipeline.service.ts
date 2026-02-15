import type { ReviewSource } from "../../controllers/content/translate-merge-reviews.controller";
import type {
  FetchReviewsPipelineWarning,
  PipelineDependencies,
  PipelineProgressUpdate,
  PipelineResult,
} from "../../types/reviews-pipeline.types";
import { PipelineExecutionError } from "./reviews-pipeline.errors";

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

