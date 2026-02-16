import type { ReviewSource } from "../../types/translate-merge-reviews.types";
import { DEFAULT_PIPELINE_SOURCES } from "../../constants/reviews-pipeline.constants";
import type { FetchReviewsPipelineDto } from "../../types/reviews-pipeline.types";

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseFetchReviewsPipelineBody(body: unknown): ParseResult<{ sources: ReviewSource[] }> {
  const payload = (typeof body === "object" && body !== null ? body : {}) as FetchReviewsPipelineDto & {
    sources?: unknown;
  };

  const requestedSources = Array.isArray(payload.sources) && payload.sources.length > 0
    ? (payload.sources as ReviewSource[])
    : [...DEFAULT_PIPELINE_SOURCES];

  const normalizedSources = new Set(
    requestedSources.map((source) => (typeof source === "string" ? source.toLowerCase() : ""))
  );
  const hasGoogle = normalizedSources.has("google");
  const hasTripadvisor = normalizedSources.has("tripadvisor");

  if (!hasGoogle && !hasTripadvisor) {
    return { ok: false, error: "At least one source is required" };
  }

  return { ok: true, value: { sources: requestedSources } };
}

export function parsePipelineStatusQuery(query: { jobId?: string }): ParseResult<{ jobId: string }> {
  if (!query.jobId) {
    return { ok: false, error: "jobId is required" };
  }

  return { ok: true, value: { jobId: query.jobId } };
}

