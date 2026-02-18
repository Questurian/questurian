import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import type { CreateMapsDto, GooglePrefillDto, PatchMapsDto } from "../../validation/schemas/maps.schemas";
import type { LocationCategory } from "../../models/location";

const container = ServiceContainer.getInstance();

export async function postAddMaps(c: Context) {
  const dto = c.get("validatedBody") as CreateMapsDto;
  const routeCategory = c.get("routeCategory") as LocationCategory | undefined;
  const payload = routeCategory ? { ...dto, category: routeCategory } : dto;
  const entry = await container.mapsService.addMapsLocation(payload, routeCategory);
  return c.json(successResponse({ entry }));
}

export async function postGooglePrefill(c: Context) {
  const dto = c.get("validatedBody") as GooglePrefillDto;
  const result = await container.mapsService.resolveGooglePrefill(dto.name, dto.address);
  return c.json(successResponse(result));
}

export async function patchMapsById(c: Context) {
  const id = parseInt(c.req.param("id"));
  const dto = c.get("validatedBody") as PatchMapsDto;
  const routeCategory = c.get("routeCategory") as LocationCategory | undefined;
  const entry = await container.mapsService.updateMapsLocationById(id, dto, routeCategory);
  return c.json(successResponse(entry));
}
