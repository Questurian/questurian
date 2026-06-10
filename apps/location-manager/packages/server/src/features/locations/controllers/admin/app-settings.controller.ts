import type { Context } from "hono";
import { successResponse } from "@shared/types/api-response";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import type { AppSettingsResponse, UpdateIntegrationToggleRequest } from "@questurian/lm-shared";
import {
  listIntegrationToggles,
  getIntegrationToggle,
  isIntegrationEnabled,
  setIntegrationEnabled,
} from "@server/shared/settings/integration-toggles";

/** GET /api/admin/settings */
export async function getAppSettings(c: Context) {
  const response: AppSettingsResponse = {
    toggles: listIntegrationToggles().map((toggle) => ({
      key: toggle.key,
      label: toggle.label,
      description: toggle.description,
      enabled: isIntegrationEnabled(toggle.key),
      available: toggle.isAvailable(),
    })),
  };
  return c.json(successResponse(response));
}

/** PUT /api/admin/settings/:key */
export async function putAppSetting(c: Context) {
  const key = c.req.param("key");
  const toggle = getIntegrationToggle(key);
  if (!toggle) throw new NotFoundError("Integration toggle", key);

  const body = (await c.req.json().catch(() => null)) as UpdateIntegrationToggleRequest | null;
  if (!body || typeof body.enabled !== "boolean") {
    throw new BadRequestError("enabled boolean required");
  }

  setIntegrationEnabled(key, body.enabled);

  return c.json(
    successResponse({
      key: toggle.key,
      label: toggle.label,
      description: toggle.description,
      enabled: body.enabled,
      available: toggle.isAvailable(),
    })
  );
}
