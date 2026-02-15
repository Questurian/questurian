import type { Context } from "hono";
import { successResponse, errorResponse } from "@shared/types/api-response";
import { startReviewsPipelineJob, getReviewsPipelineJob } from "../../services/content/reviews-pipeline-job.service";
import { executePipeline } from "../../services/content/reviews-pipeline.service";
import type { FetchReviewsPipelineDto } from "../../types/reviews-pipeline.types";
import { parseFetchReviewsPipelineBody, parsePipelineStatusQuery } from "../../validation/schemas/reviews-pipeline.schemas";

export { executePipeline };
export type { FetchReviewsPipelineWarning, PipelineResult } from "../../types/reviews-pipeline.types";

export async function fetchReviewsPipeline(c: Context) {
  const locationId = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<FetchReviewsPipelineDto>().catch(() => ({} as FetchReviewsPipelineDto));
  const parsedBody = parseFetchReviewsPipelineBody(body);

  if (!parsedBody.ok) {
    return c.json(errorResponse(parsedBody.error), 400);
  }

  const startResult = startReviewsPipelineJob(locationId, parsedBody.value.sources);
  if (startResult.kind === "location_not_found") {
    return c.json(errorResponse("Location not found"), 404);
  }

  const { job } = startResult;
  return c.json(
    successResponse({
      jobId: job.id,
      status: job.status,
      step: job.step,
      progress: job.progress,
      message: job.message,
    })
  );
}

export async function getReviewsPipelineStatus(c: Context) {
  const locationId = parseInt(c.req.param("id"), 10);
  const parsedQuery = parsePipelineStatusQuery({ jobId: c.req.query("jobId") });

  if (!parsedQuery.ok) {
    return c.json(errorResponse(parsedQuery.error), 400);
  }

  const job = getReviewsPipelineJob(locationId, parsedQuery.value.jobId);
  if (!job) {
    return c.json(errorResponse("Pipeline job not found"), 404);
  }

  return c.json(
    successResponse({
      jobId: job.id,
      status: job.status,
      step: job.step,
      progress: job.progress,
      message: job.message,
      warnings: job.warnings,
      result: job.result,
      error: job.error,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
    })
  );
}

