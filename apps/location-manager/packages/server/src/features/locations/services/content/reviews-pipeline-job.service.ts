import { randomUUID } from "node:crypto";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import type { ReviewSource } from "../../types/translate-merge-reviews.types";
import { JOB_TTL_MS } from "../../constants/reviews-pipeline.constants";
import { updateLocationReviewStats } from "../../repositories/content/reviews-pipeline.repository";
import type { ReviewsPipelineJob } from "../../types/reviews-pipeline.types";
import { nowIso } from "../../utils/reviews-pipeline.utils";
import { createReviewsPipelineDependencies } from "./reviews-pipeline-dependencies.service";
import { PipelineExecutionError } from "./reviews-pipeline.errors";
import { executePipeline } from "./reviews-pipeline.service";

const container = ServiceContainer.getInstance();
const JOBS = new Map<string, ReviewsPipelineJob>();

type PipelineLocation = NonNullable<ReturnType<typeof container.locationQueryService.getLocationById>>;

export type StartReviewsPipelineJobResult =
  | { kind: "started"; job: ReviewsPipelineJob }
  | { kind: "location_not_found" };

function createJob(locationId: number, sources: ReviewSource[]): ReviewsPipelineJob {
  const id = typeof randomUUID === "function"
    ? randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const job: ReviewsPipelineJob = {
    id,
    locationId,
    sources,
    status: "queued",
    step: "queued",
    progress: 0,
    message: null,
    warnings: null,
    result: null,
    error: null,
    startedAt: nowIso(),
    updatedAt: nowIso(),
  };

  JOBS.set(id, job);
  return job;
}

function updateJob(id: string, patch: Partial<ReviewsPipelineJob>) {
  const job = JOBS.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: nowIso() });
}

function finalizeJob(id: string) {
  setTimeout(() => {
    const job = JOBS.get(id);
    if (!job) return;
    JOBS.delete(id);
  }, JOB_TTL_MS).unref?.();
}

async function runPipelineJob(job: ReviewsPipelineJob, location: PipelineLocation) {
  updateJob(job.id, { status: "running", step: "fetching_google", progress: 5, message: "Preparing pipeline" });

  try {
    const result = await executePipeline(
      job.locationId,
      { placeId: location.placeId, tripadvisorUrl: location.tripadvisorUrl },
      job.sources,
      createReviewsPipelineDependencies(),
      (update) => updateJob(job.id, { ...update })
    );

    const reviewsUpdateSuccess = updateLocationReviewStats(job.locationId, result.merged.stats);
    if (!reviewsUpdateSuccess) {
      console.error(`Failed to update reviews stats for location ${job.locationId}`);
    }

    updateJob(job.id, {
      status: "completed",
      step: "completed",
      progress: 100,
      message: result.message,
      warnings: result.warnings,
      result,
    });
    finalizeJob(job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    const status = error instanceof PipelineExecutionError ? error.status : 500;

    updateJob(job.id, {
      status: "failed",
      step: "failed",
      progress: 100,
      error: message,
      message: status === 400 ? "Missing required data for selected sources" : "Pipeline failed",
    });
    finalizeJob(job.id);
  }
}

export function startReviewsPipelineJob(
  locationId: number,
  sources: ReviewSource[]
): StartReviewsPipelineJobResult {
  const location = container.locationQueryService.getLocationById(locationId);
  if (!location) {
    return { kind: "location_not_found" };
  }

  const job = createJob(locationId, sources);

  runPipelineJob(job, location).catch((error) => {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    updateJob(job.id, {
      status: "failed",
      step: "failed",
      progress: 100,
      error: message,
      message,
    });
    finalizeJob(job.id);
  });

  return { kind: "started", job };
}

export function getReviewsPipelineJob(locationId: number, jobId: string): ReviewsPipelineJob | null {
  const job = JOBS.get(jobId);
  if (!job || job.locationId !== locationId) {
    return null;
  }

  return job;
}

