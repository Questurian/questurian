import type { FetchReviewsPipelineWarning, PipelineResult } from "../types/reviews-pipeline.types";

export function buildPipelineCompletionMessage(
  fetched: PipelineResult["fetched"],
  mergedReviewCount: number,
  warnings: FetchReviewsPipelineWarning[]
): string {
  const fetchedLabels: string[] = [];

  if (fetched.google) {
    fetchedLabels.push(`Google (${fetched.google.reviewCount ?? 0})`);
  }

  if (fetched.tripadvisor) {
    fetchedLabels.push(`TripAdvisor (${fetched.tripadvisor.totalReviews ?? 0})`);
  }

  let message = `Pipeline complete: ${fetchedLabels.join(" + ")} reviews fetched, ${mergedReviewCount} merged.`;
  if (warnings.length > 0) {
    message += ` ${warnings.length} warning${warnings.length > 1 ? "s" : ""}.`;
  }

  return message;
}
