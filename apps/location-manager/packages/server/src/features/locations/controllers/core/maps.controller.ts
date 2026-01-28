import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import type { CreateMapsDto, PatchMapsDto } from "../../validation/schemas/maps.schemas";

const container = ServiceContainer.getInstance();

export async function postAddMaps(c: Context) {
  const dto = c.get("validatedBody") as CreateMapsDto;
  const entry = await container.mapsService.addMapsLocation(dto);
  return c.json(successResponse({ entry }));
}

export async function patchMapsById(c: Context) {
  const id = parseInt(c.req.param("id"));
  const dto = c.get("validatedBody") as PatchMapsDto;
  const entry = await container.mapsService.updateMapsLocationById(id, dto);
  return c.json(successResponse(entry));
}
