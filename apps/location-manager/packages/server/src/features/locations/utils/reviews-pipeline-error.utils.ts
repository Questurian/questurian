import type { FetchReviewsPipelineWarning } from "../types/reviews-pipeline.types";
import { PIPELINE_CLIENT_WARNING_KEYWORDS } from "../constants/reviews-pipeline.constants";

export function isClientWarningMessage(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return PIPELINE_CLIENT_WARNING_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword));
}

export function resolvePipelineFetchErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function resolvePipelineFailureStatus(warnings: FetchReviewsPipelineWarning[]): 400 | 500 {
  return warnings.some((warning) => isClientWarningMessage(warning.message)) ? 400 : 500;
}
