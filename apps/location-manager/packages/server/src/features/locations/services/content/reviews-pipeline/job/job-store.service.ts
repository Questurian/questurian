import { randomUUID } from "node:crypto";
import type { ReviewSource } from "../../../../types/translate-merge-reviews.types";
import type { ReviewsPipelineJob } from "../../../../types/reviews-pipeline.types";
import { JOB_TTL_MS } from "../../../../constants/reviews-pipeline.constants";
import { nowIso } from "../../../../utils/reviews-pipeline.utils";

const JOBS = new Map<string, ReviewsPipelineJob>();

function createPipelineJobId(): string {
  return typeof randomUUID === "function"
    ? randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createPipelineJob(locationId: number, sources: ReviewSource[]): ReviewsPipelineJob {
  const id = createPipelineJobId();
  const timestamp = nowIso();

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
    startedAt: timestamp,
    updatedAt: timestamp,
  };

  JOBS.set(id, job);
  return job;
}

export function updatePipelineJob(id: string, patch: Partial<ReviewsPipelineJob>): void {
  const job = JOBS.get(id);
  if (!job) {
    return;
  }

  Object.assign(job, patch, { updatedAt: nowIso() });
}

export function schedulePipelineJobCleanup(id: string): void {
  setTimeout(() => {
    if (!JOBS.has(id)) {
      return;
    }

    JOBS.delete(id);
  }, JOB_TTL_MS).unref?.();
}

export function getPipelineJobForLocation(locationId: number, jobId: string): ReviewsPipelineJob | null {
  const job = JOBS.get(jobId);
  if (!job || job.locationId !== locationId) {
    return null;
  }

  return job;
}
