import type { Context } from "hono";
import { successResponse, errorResponse } from "@shared/types/api-response";
import {
  fetchTripAdvisorPlaceData,
  getAiJsonDownloadPayload,
  getLocationExportDownloadPayload,
  getTripAdvisorPlaceDownloadPayload,
  getTripAdvisorPlaceStatusPayload,
} from "../../services/content/tripadvisor-place.service";
import { TripAdvisorPlaceError } from "../../services/content/tripadvisor-place.errors";
import { TRIPADVISOR_PLACE_MESSAGES } from "../../constants/tripadvisor-place.constants";
import { parseLocationIdParam } from "../../validation/tripadvisor-place.validators";

type SupportedErrorStatus = 400 | 404 | 500;

function toSupportedStatus(status: number): SupportedErrorStatus {
  if (status === 400 || status === 404) {
    return status;
  }
  return 500;
}

function resolveHttpError(
  error: unknown,
  fallbackMessage: string
): { message: string; status: SupportedErrorStatus } {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const status = error instanceof TripAdvisorPlaceError ? toSupportedStatus(error.status) : 500;
  return { message, status };
}

function applyJsonDownloadHeaders(c: Context, filename: string): void {
  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
}

function parseLocationIdOrError(c: Context): { ok: true; locationId: number } | { ok: false; response: Response } {
  const parsed = parseLocationIdParam(c.req.param("id"));
  if (!parsed.ok) {
    return { ok: false, response: c.json(errorResponse(parsed.error), 400) };
  }

  return { ok: true, locationId: parsed.value };
}

/**
 * POST /api/{category}/:id/tripadvisor-place/fetch
 * Fetch TripAdvisor place data from SerpAPI for a location
 */
export async function fetchTripAdvisorPlace(c: Context) {
  const parsed = parseLocationIdOrError(c);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const payload = await fetchTripAdvisorPlaceData(parsed.locationId);
    return c.json(successResponse(payload));
  } catch (error) {
    const httpError = resolveHttpError(error, TRIPADVISOR_PLACE_MESSAGES.fetchFailure);
    return c.json(errorResponse(httpError.message), httpError.status);
  }
}

/**
 * GET /api/{category}/:id/tripadvisor-place/download
 * Download TripAdvisor place data for a location
 */
export async function downloadTripAdvisorPlace(c: Context) {
  const parsed = parseLocationIdOrError(c);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const payload = await getTripAdvisorPlaceDownloadPayload(parsed.locationId);
    applyJsonDownloadHeaders(c, payload.filename);
    return c.body(payload.content);
  } catch (error) {
    const httpError = resolveHttpError(error, TRIPADVISOR_PLACE_MESSAGES.downloadFailure);
    return c.json(errorResponse(httpError.message), httpError.status);
  }
}

/**
 * GET /api/{category}/:id/export
 * Download complete location data with TripAdvisor place data (no reviews)
 */
export async function downloadLocationExport(c: Context) {
  const parsed = parseLocationIdOrError(c);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const payload = getLocationExportDownloadPayload(parsed.locationId);
    applyJsonDownloadHeaders(c, payload.filename);
    return c.body(payload.content);
  } catch (error) {
    const httpError = resolveHttpError(error, TRIPADVISOR_PLACE_MESSAGES.exportFailure);
    return c.json(errorResponse(httpError.message), httpError.status);
  }
}

/**
 * GET /api/{category}/:id/ai-json/download
 * Download category-specific review2blog export JSON
 */
export async function downloadAiJson(c: Context) {
  const parsed = parseLocationIdOrError(c);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const payload = await getAiJsonDownloadPayload(parsed.locationId);
    applyJsonDownloadHeaders(c, payload.filename);
    return c.body(payload.content);
  } catch (error) {
    const httpError = resolveHttpError(error, TRIPADVISOR_PLACE_MESSAGES.aiJsonFailure);
    return c.json(errorResponse(httpError.message), httpError.status);
  }
}

/**
 * GET /api/{category}/:id/tripadvisor-place/status
 * Check if TripAdvisor place data exists for a location
 */
export async function getTripAdvisorPlaceStatus(c: Context) {
  const parsed = parseLocationIdOrError(c);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const payload = await getTripAdvisorPlaceStatusPayload(parsed.locationId);
    return c.json(successResponse(payload));
  } catch (error) {
    const httpError = resolveHttpError(error, TRIPADVISOR_PLACE_MESSAGES.statusFailure);
    return c.json(errorResponse(httpError.message), httpError.status);
  }
}
