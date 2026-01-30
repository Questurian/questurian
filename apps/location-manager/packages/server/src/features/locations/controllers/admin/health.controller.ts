import type { Context } from "hono";
import { successResponse, errorResponse } from "@shared/types/api-response";

const LEADS_API_URL = process.env.LEADS_API_URL || "http://localhost:4004";
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Check if the leads API is healthy (for reviews fetching)
 *
 * GET /api/health/leads-api
 */
export async function checkLeadsApiHealth(c: Context) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    const response = await fetch(`${LEADS_API_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return c.json(successResponse({
        healthy: false,
        error: `Leads API returned status ${response.status}`,
      }));
    }

    return c.json(successResponse({
      healthy: true,
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = error instanceof Error && error.name === "AbortError";

    return c.json(successResponse({
      healthy: false,
      error: isTimeout ? "Connection timeout" : `Connection failed: ${errorMessage}`,
    }));
  }
}
