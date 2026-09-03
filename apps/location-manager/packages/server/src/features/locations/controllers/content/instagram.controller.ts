import type { Context } from "hono";
import { successResponse } from "@shared/types/api-response";
import type { AddInstagramDto, AddInstagramParamsDto, DeleteInstagramEmbedParams } from "../../validation/schemas/instagram.schemas";
import type { AddInstagramRequest } from "../../models/location";
import { getInstagramControllerDeps } from "../dependencies";
import { getInstagramApiQuota } from "@server/shared/settings/instagram-api-quota";

const { instagram } = getInstagramControllerDeps();

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

  const entry = await instagram.addInstagramEmbed(payload);
  return c.json(successResponse({ entry }));
}

export async function deleteInstagramEmbed(c: Context) {
  const { id } = c.get("validatedParams") as DeleteInstagramEmbedParams;

  await instagram.deleteInstagramEmbed(id);

  return c.json(successResponse({ message: "Instagram embed deleted successfully" }));
}

export async function retryInstagramMediaStaging(c: Context) {
  const { id } = c.get("validatedParams") as DeleteInstagramEmbedParams;
  const entry = await instagram.retryMediaStaging(id);
  return c.json(successResponse({ entry }));
}

export async function getInstagramApiQuotaStatus(c: Context) {
  return c.json(successResponse(getInstagramApiQuota()));
}
