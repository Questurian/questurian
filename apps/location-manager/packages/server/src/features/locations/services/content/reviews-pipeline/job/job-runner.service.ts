import {
  PIPELINE_JOB_MESSAGES,
  PIPELINE_JOB_PROGRESS,
} from "../../../../constants/reviews-pipeline.constants";
import { updateLocationReviewStats } from "../../../../repositories/content/reviews-pipeline.repository";
import type { ReviewsPipelineJob } from "../../../../types/reviews-pipeline.types";
import { createReviewsPipelineDependencies } from "../dependencies/dependencies.service";
import { PipelineExecutionError } from "../pipeline.errors";
import { executePipeline } from "../orchestration/pipeline.service";

type PipelineLocation = {
  placeId?: string | null;
  tripadvisorUrl?: string | null;
};

export interface PipelineJobStateHandlers {
  updateJob: (id: string, patch: Partial<ReviewsPipelineJob>) => void;
  finalizeJob: (id: string) => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : PIPELINE_JOB_MESSAGES.failed;
}

export function markPipelineJobFailed(
  jobId: string,
  error: unknown,
  handlers: PipelineJobStateHandlers
): void {
  const message = getErrorMessage(error);
  const status = error instanceof PipelineExecutionError ? error.status : 500;

  handlers.updateJob(jobId, {
    status: "failed",
    step: "failed",
    progress: PIPELINE_JOB_PROGRESS.done,
    error: message,
    message: status === 400 ? PIPELINE_JOB_MESSAGES.missingRequiredData : PIPELINE_JOB_MESSAGES.failed,
  });
  handlers.finalizeJob(jobId);
}

export function markPipelineJobUnexpectedFailure(
  jobId: string,
  error: unknown,
  handlers: PipelineJobStateHandlers
): void {
  const message = getErrorMessage(error);
  handlers.updateJob(jobId, {
    status: "failed",
    step: "failed",
    progress: PIPELINE_JOB_PROGRESS.done,
    error: message,
    message,
  });
  handlers.finalizeJob(jobId);
}

export async function runPipelineJob(
  job: ReviewsPipelineJob,
  location: PipelineLocation,
  handlers: PipelineJobStateHandlers
): Promise<void> {
  handlers.updateJob(job.id, {
    status: "running",
    step: "fetching_google",
    progress: PIPELINE_JOB_PROGRESS.preparing,
    message: PIPELINE_JOB_MESSAGES.preparing,
  });

  try {
    const result = await executePipeline(
      job.locationId,
      { placeId: location.placeId, tripadvisorUrl: location.tripadvisorUrl },
      job.sources,
      createReviewsPipelineDependencies(),
      (update) => handlers.updateJob(job.id, { ...update })
    );

    const reviewsUpdateSuccess = updateLocationReviewStats(job.locationId, result.merged.stats);
    if (!reviewsUpdateSuccess) {
      console.error(`Failed to update reviews stats for location ${job.locationId}`);
    }

    handlers.updateJob(job.id, {
      status: "completed",
      step: "completed",
      progress: PIPELINE_JOB_PROGRESS.done,
      message: result.message,
      warnings: result.warnings,
      result,
    });
    handlers.finalizeJob(job.id);
  } catch (error) {
    markPipelineJobFailed(job.id, error, handlers);
  }
}
