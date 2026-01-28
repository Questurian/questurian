import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import type { AddInstagramDto, AddInstagramParamsDto, DeleteInstagramEmbedParams } from "../../validation/schemas/instagram.schemas";
import type { AddInstagramRequest } from "../../models/location";

const container = ServiceContainer.getInstance();

export async function postAddInstagram(c: Context) {
  // Extract validated URL parameter
  const params = c.get("validatedParams") as AddInstagramParamsDto;
  const locationId = params.id;

  // Extract validated body
  const dto = c.get("validatedBody") as AddInstagramDto;

  // Compose full payload for service
  const payload: AddInstagramRequest = {
    embedCode: dto.embedCode,
    locationId: locationId
  };

  const entry = await container.instagramService.addInstagramEmbed(payload);
  return c.json(successResponse({ entry }));
}

export async function deleteInstagramEmbed(c: Context) {
  const { id } = c.get("validatedParams") as DeleteInstagramEmbedParams;

  await container.instagramService.deleteInstagramEmbed(id);

  return c.json(successResponse({ message: "Instagram embed deleted successfully" }));
}
