import type { Context } from "hono";
import { successResponse } from "@shared/types/api-response";
import { EnvConfig } from "@server/shared/config/env.config";

const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Check whether the translation backend (Vertex-backed python-alt-text) is reachable.
 * The reviews pipeline needs it to translate non-English reviews mid-merge.
 *
 * GET /api/health/translation-api
 */
export async function checkTranslationApiHealth(c: Context) {
  const baseUrl = EnvConfig.getInstance().altTextApiUrl;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    const response = await fetch(`${baseUrl}/test`, { signal: controller.signal });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return c.json(successResponse({
        healthy: false,
        error: `Translation API returned status ${response.status}`,
      }));
    }

    return c.json(successResponse({ healthy: true }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = error instanceof Error && error.name === "AbortError";

    return c.json(successResponse({
      healthy: false,
      error: isTimeout ? "Connection timeout" : `Connection failed: ${errorMessage}`,
    }));
  }
}
