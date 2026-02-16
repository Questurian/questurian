import type { ReviewSource } from "../../types/translate-merge-reviews.types";
import type {
  PipelineDependencies,
  PipelineLocation,
  PipelineProgressUpdate,
  PipelineResult,
} from "../../types/reviews-pipeline.types";
import {
  PIPELINE_EXECUTION_FAILURE_MESSAGE,
  PIPELINE_PROGRESS,
  PIPELINE_PROGRESS_MESSAGES,
} from "../../constants/reviews-pipeline.constants";
import { resolvePipelineFailureStatus } from "../../utils/reviews-pipeline-error.utils";
import { buildPipelineCompletionMessage } from "../../utils/reviews-pipeline-message.utils";
import { PipelineExecutionError } from "./reviews-pipeline.errors";
import { fetchSelectedSources } from "./reviews-pipeline-source-fetch.service";

export async function executePipeline(
  locationId: number,
  location: PipelineLocation,
  sources: ReviewSource[],
  deps: PipelineDependencies,
  onProgress?: (update: PipelineProgressUpdate) => void
): Promise<PipelineResult> {
  const { warnings, fetched, googleFetched, tripadvisorFetched, anyFetched } = await fetchSelectedSources(
    locationId,
    location,
    sources,
    deps,
    onProgress
  );

  if (!anyFetched) {
    throw new PipelineExecutionError(
      PIPELINE_EXECUTION_FAILURE_MESSAGE,
      resolvePipelineFailureStatus(warnings)
    );
  }

  onProgress?.({
    step: "translating_merging",
    progress: PIPELINE_PROGRESS.translatingMerging,
    message: PIPELINE_PROGRESS_MESSAGES.translatingMerging,
  });

  const merged = await deps.merge(locationId, googleFetched, tripadvisorFetched);

  return {
    message: buildPipelineCompletionMessage(fetched, merged.stats.totalReviews, warnings),
    selectedSources: sources,
    fetched,
    merged,
    warnings: warnings.length > 0 ? warnings : null,
  };
}

