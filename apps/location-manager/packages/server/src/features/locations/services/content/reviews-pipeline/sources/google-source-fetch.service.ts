import {
  PIPELINE_FETCH_ERROR_MESSAGES,
  PIPELINE_PROGRESS,
  PIPELINE_PROGRESS_MESSAGES,
} from "../../../../constants/reviews-pipeline.constants";
import type {
  FetchReviewsPipelineWarning,
  FetchedGoogleReviewsResult,
  PipelineDependencies,
  PipelineLocation,
  PipelineProgressUpdate,
} from "../../../../types/reviews-pipeline.types";
import { resolvePipelineFetchErrorMessage } from "../../../../utils/reviews-pipeline-error.utils";
import { validateGoogleSourceFetch } from "../../../../validation/reviews-pipeline-source-fetch.validators";

export interface GoogleSourceFetchResult {
  warning?: FetchReviewsPipelineWarning;
  payload?: FetchedGoogleReviewsResult;
}

export async function fetchGoogleSource(
  locationId: number,
  location: PipelineLocation,
  deps: PipelineDependencies,
  onProgress?: (update: PipelineProgressUpdate) => void
): Promise<GoogleSourceFetchResult> {
  onProgress?.({
    step: "fetching_google",
    progress: PIPELINE_PROGRESS.fetchingGoogle,
    message: PIPELINE_PROGRESS_MESSAGES.fetchingGoogle,
  });

  const validation = validateGoogleSourceFetch(deps.isGoogleConfigured(), location);
  if (!validation.ok) {
    return { warning: validation.warning };
  }

  try {
    const payload = await deps.fetchGoogle(locationId, { placeId: validation.value });
    return { payload };
  } catch (error) {
    return {
      warning: {
        source: "google",
        message: resolvePipelineFetchErrorMessage(error, PIPELINE_FETCH_ERROR_MESSAGES.google),
      },
    };
  }
}
