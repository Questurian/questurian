import {
  PIPELINE_FETCH_ERROR_MESSAGES,
  PIPELINE_PROGRESS,
  PIPELINE_PROGRESS_MESSAGES,
} from "../../../../constants/reviews-pipeline.constants";
import type {
  FetchReviewsPipelineWarning,
  FetchedTripadvisorReviewsResult,
  PipelineDependencies,
  PipelineLocation,
  PipelineProgressUpdate,
} from "../../../../types/reviews-pipeline.types";
import { resolvePipelineFetchErrorMessage } from "../../../../utils/reviews-pipeline-error.utils";
import { validateTripadvisorSourceFetch } from "../../../../validation/reviews-pipeline-source-fetch.validators";

export interface TripadvisorSourceFetchResult {
  warning?: FetchReviewsPipelineWarning;
  payload?: FetchedTripadvisorReviewsResult;
}

export async function fetchTripadvisorSource(
  locationId: number,
  location: PipelineLocation,
  deps: PipelineDependencies,
  onProgress?: (update: PipelineProgressUpdate) => void
): Promise<TripadvisorSourceFetchResult> {
  onProgress?.({
    step: "fetching_tripadvisor",
    progress: PIPELINE_PROGRESS.fetchingTripadvisor,
    message: PIPELINE_PROGRESS_MESSAGES.fetchingTripadvisor,
  });

  const validation = validateTripadvisorSourceFetch(deps.isTripadvisorConfigured(), location);
  if (!validation.ok) {
    return { warning: validation.warning };
  }

  try {
    const payload = await deps.fetchTripadvisor(locationId, { tripadvisorUrl: validation.value });
    return { payload };
  } catch (error) {
    return {
      warning: {
        source: "tripadvisor",
        message: resolvePipelineFetchErrorMessage(error, PIPELINE_FETCH_ERROR_MESSAGES.tripadvisor),
      },
    };
  }
}
