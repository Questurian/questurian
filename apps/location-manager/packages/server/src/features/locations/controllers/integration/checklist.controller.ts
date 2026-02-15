/**
 * Checklist Controller
 * Provides pipeline status checklists for the UI
 * Endpoints:
 * - GET /api/locations/:id/payload-sync/checklist
 * - GET /api/locations/:id/reviews/checklist
 * - GET /api/locations/:id/json-export/checklist
 * - GET /api/locations/:id/pipelines/status
 */

import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse, errorResponse } from "@shared/types/api-response";
import { NotFoundError } from "@shared/errors/http-error";

const container = ServiceContainer.getInstance();
const checklistService = container.checklistService;

/**
 * GET /api/locations/:id/payload-sync/checklist
 * Get Payload Sync checklist for a location
 */
export async function getPayloadSyncChecklist(c: Context) {
  try {
    const id = parseInt(c.req.param("id"));

    if (isNaN(id)) {
      return c.json(
        errorResponse("Invalid location ID"),
        400
      );
    }

    const checklist = checklistService.getPayloadSyncChecklist(id);

    return c.json(
      successResponse({
        data: checklist,
        timestamp: new Date().toISOString(),
        locationId: id,
      }),
      200
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(errorResponse(error.message), 404);
    }
    return c.json(
      errorResponse(
        error instanceof Error ? error.message : "Failed to get checklist"
      ),
      500
    );
  }
}

/**
 * GET /api/locations/:id/reviews/checklist
 * Get Reviews Pipeline checklist for a location
 */
export async function getReviewsChecklist(c: Context) {
  try {
    const id = parseInt(c.req.param("id"));

    if (isNaN(id)) {
      return c.json(
        errorResponse("Invalid location ID"),
        400
      );
    }

    const checklist = checklistService.getReviewsChecklist(id);

    return c.json(
      successResponse({
        data: checklist,
        timestamp: new Date().toISOString(),
        locationId: id,
      }),
      200
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(errorResponse(error.message), 404);
    }
    return c.json(
      errorResponse(
        error instanceof Error ? error.message : "Failed to get checklist"
      ),
      500
    );
  }
}

/**
 * GET /api/locations/:id/json-export/checklist
 * Get JSON Export checklist for a location
 */
export async function getJsonExportChecklist(c: Context) {
  try {
    const id = parseInt(c.req.param("id"));

    if (isNaN(id)) {
      return c.json(
        errorResponse("Invalid location ID"),
        400
      );
    }

    const checklist = checklistService.getJsonExportChecklist(id);

    return c.json(
      successResponse({
        data: checklist,
        timestamp: new Date().toISOString(),
        locationId: id,
      }),
      200
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(errorResponse(error.message), 404);
    }
    return c.json(
      errorResponse(
        error instanceof Error ? error.message : "Failed to get checklist"
      ),
      500
    );
  }
}

/**
 * GET /api/locations/:id/pipelines/status
 * Get combined status for all three pipelines
 */
export async function getCombinedPipelineStatus(c: Context) {
  try {
    const id = parseInt(c.req.param("id"));

    if (isNaN(id)) {
      return c.json(
        errorResponse("Invalid location ID"),
        400
      );
    }

    const status = checklistService.getCombinedPipelineStatus(id);

    return c.json(
      successResponse({
        data: status,
        timestamp: new Date().toISOString(),
        locationId: id,
      }),
      200
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return c.json(errorResponse(error.message), 404);
    }
    return c.json(
      errorResponse(
        error instanceof Error ? error.message : "Failed to get pipeline status"
      ),
      500
    );
  }
}
