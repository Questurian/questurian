import type { Context } from "hono";
import { successResponse, errorResponse } from "@shared/types/api-response";
import {
  getMergedReviewsDownloadPayload,
  getMergedReviewsReportPayload,
  getMergedReviewsStatusPayload,
  getRejectsReportDownloadPayload,
  runTranslateAndMergeReviews,
} from "../../services/content/translate-merge/orchestration.service";
import { TranslateMergeError } from "../../services/content/translate-merge/errors";
import type { ReviewSource } from "../../types/translate-merge-reviews.types";
import { parseTranslateMergeRequest } from "../../validation/schemas/translate-merge-reviews.schemas";

export type { ReviewSource } from "../../types/translate-merge-reviews.types";
export { runTranslateAndMergeReviews };

type SupportedErrorStatus = 400 | 404 | 500;

function toSupportedStatus(status: number): SupportedErrorStatus {
  if (status === 400 || status === 404) {
    return status;
  }
  return 500;
}

function resolveHttpError(error: unknown, fallbackMessage: string): { message: string; status: SupportedErrorStatus } {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const status = error instanceof TranslateMergeError ? toSupportedStatus(error.status) : 500;
  return { message, status };
}

/**
 * POST /api/{category}/:id/reviews/translate-merge
 * Collect all reviews, translate non-English ones, and merge into a single file
 */
export async function translateAndMergeReviews(c: Context) {
  const locationId = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{ sources?: ReviewSource[] }>().catch(() => ({} as { sources?: ReviewSource[] }));
  const parsed = parseTranslateMergeRequest(body);

  if (!parsed.ok) {
    return c.json(errorResponse(parsed.error), 400);
  }

  try {
    const result = await runTranslateAndMergeReviews(locationId, parsed.value);
    return c.json(successResponse(result));
  } catch (error) {
    const httpError = resolveHttpError(error, "Failed to translate and merge reviews");
    return c.json(errorResponse(httpError.message), httpError.status);
  }
}

/**
 * GET /api/{category}/:id/reviews/merged/download
 * Download the latest merged reviews file in minimal format (text, rating, date array)
 */
export async function downloadMergedReviews(c: Context) {
  const locationId = parseInt(c.req.param("id"), 10);

  try {
    const payload = await getMergedReviewsDownloadPayload(locationId);
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${payload.filename}"`);
    return c.body(payload.content);
  } catch (error) {
    const httpError = resolveHttpError(error, "Failed to download merged reviews");
    return c.json(errorResponse(httpError.message), httpError.status);
  }
}

/**
 * GET /api/{category}/:id/reviews/merged/report
 * Get the full report data (stats, errors, translations) for display in a dialog
 */
export async function getMergedReviewsReport(c: Context) {
  const locationId = parseInt(c.req.param("id"), 10);

  try {
    const report = await getMergedReviewsReportPayload(locationId);
    return c.json(successResponse(report));
  } catch (error) {
    const httpError = resolveHttpError(error, "Failed to load merged reviews report");
    return c.json(errorResponse(httpError.message), httpError.status);
  }
}

/**
 * GET /api/{category}/:id/reviews/rejects/download
 * Download the latest rejects report for a location
 */
export async function downloadRejectsReport(c: Context) {
  const locationId = parseInt(c.req.param("id"), 10);

  try {
    const payload = await getRejectsReportDownloadPayload(locationId);
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${payload.filename}"`);
    return c.body(payload.content);
  } catch (error) {
    const httpError = resolveHttpError(error, "Failed to download rejects report");
    return c.json(errorResponse(httpError.message), httpError.status);
  }
}

/**
 * GET /api/{category}/:id/reviews/merged/status
 * Check if merged reviews exist for a location
 */
export async function getMergedReviewsStatus(c: Context) {
  const locationId = parseInt(c.req.param("id"), 10);

  try {
    const status = await getMergedReviewsStatusPayload(locationId);
    return c.json(successResponse(status));
  } catch (error) {
    const httpError = resolveHttpError(error, "Failed to load merged reviews status");
    return c.json(errorResponse(httpError.message), httpError.status);
  }
}
