import { ServiceContainer } from "@server/features/locations/container/service-container";
import type { ReviewSource } from "../../../../types/translate-merge-reviews.types";
import type { ReviewsPipelineJob } from "../../../../types/reviews-pipeline.types";
import {
  createPipelineJob,
  getPipelineJobForLocation,
  schedulePipelineJobCleanup,
  updatePipelineJob,
} from "./job-store.service";
import { markPipelineJobUnexpectedFailure, runPipelineJob } from "./job-runner.service";

const container = ServiceContainer.getInstance();

export type StartReviewsPipelineJobResult =
  | { kind: "started"; job: ReviewsPipelineJob }
  | { kind: "location_not_found" };

const jobStateHandlers = {
  updateJob: updatePipelineJob,
  finalizeJob: schedulePipelineJobCleanup,
};

export function startReviewsPipelineJob(
  locationId: number,
  sources: ReviewSource[]
): StartReviewsPipelineJobResult {
  const location = container.locationQueryService.getLocationById(locationId);
  if (!location) {
    return { kind: "location_not_found" };
  }

  const job = createPipelineJob(locationId, sources);

  runPipelineJob(
    job,
    { placeId: location.placeId, tripadvisorUrl: location.tripadvisorUrl },
    jobStateHandlers
  ).catch((error) => {
    markPipelineJobUnexpectedFailure(job.id, error, jobStateHandlers);
  });

  return { kind: "started", job };
}

export function getReviewsPipelineJob(locationId: number, jobId: string): ReviewsPipelineJob | null {
  return getPipelineJobForLocation(locationId, jobId);
}
