import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import { BadRequestError } from "@shared/errors/http-error";

const container = ServiceContainer.getInstance();

export async function postPendingSuggestionAccept(c: Context) {
  return resolve(c, "accept");
}

export async function postPendingSuggestionDismiss(c: Context) {
  return resolve(c, "dismiss");
}

async function resolve(c: Context, action: "accept" | "dismiss") {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new BadRequestError("Location id must be a positive integer");
  }
  const body = (await c.req.json().catch(() => ({}))) as { field?: unknown };
  if (typeof body.field !== "string" || body.field.length === 0) {
    throw new BadRequestError("Body must include a `field` string");
  }
  const result = container.pendingSuggestionsService.acceptOrDismiss(id, body.field, action);
  return c.json(successResponse(result));
}
