import { PIPELINE_WARNING_MESSAGES } from "../constants/reviews-pipeline.constants";
import type {
  FetchReviewsPipelineWarning,
  PipelineLocation,
} from "../types/reviews-pipeline.types";

type SourceValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; warning: FetchReviewsPipelineWarning };

export function validateGoogleSourceFetch(
  isConfigured: boolean,
  location: PipelineLocation
): SourceValidationResult<string> {
  if (!isConfigured) {
    return {
      ok: false,
      warning: {
        source: "google",
        message: PIPELINE_WARNING_MESSAGES.googleNotConfigured,
      },
    };
  }

  if (!location.placeId) {
    return {
      ok: false,
      warning: {
        source: "google",
        message: PIPELINE_WARNING_MESSAGES.googleMissingPlaceId,
      },
    };
  }

  return { ok: true, value: location.placeId };
}

export function validateTripadvisorSourceFetch(
  isConfigured: boolean,
  location: PipelineLocation
): SourceValidationResult<string> {
  if (!isConfigured) {
    return {
      ok: false,
      warning: {
        source: "tripadvisor",
        message: PIPELINE_WARNING_MESSAGES.tripadvisorNotConfigured,
      },
    };
  }

  if (!location.tripadvisorUrl) {
    return {
      ok: false,
      warning: {
        source: "tripadvisor",
        message: PIPELINE_WARNING_MESSAGES.tripadvisorMissingUrl,
      },
    };
  }

  return { ok: true, value: location.tripadvisorUrl };
}
