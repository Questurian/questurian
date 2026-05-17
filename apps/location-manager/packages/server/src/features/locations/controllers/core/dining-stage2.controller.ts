import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import { BadRequestError } from "@shared/errors/http-error";

const container = ServiceContainer.getInstance();

export async function postDiningStage2Suggest(c: Context) {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new BadRequestError("Location id must be a positive integer");
  }
  const result = await container.diningStage2SuggestionService.runStage2(id);
  return c.json(successResponse(result));
}
