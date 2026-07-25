import type { Context } from "hono";
import { successResponse } from "@shared/types/api-response";
import { NotFoundError } from "@shared/errors/http-error";
import {
  createTour,
  getTourById,
  listTours,
  updateTour,
} from "../../repositories/core";
import type {
  CreateTourDto,
  ListToursQueryDto,
  TourIdParamsDto,
  UpdateTourDto,
} from "../../validation/schemas/tours.schemas";
import { normalizeTourImportUrl } from "../../services/tour-import/provider-detection";

export async function getTours(c: Context) {
  const query = c.get("validatedQuery") as ListToursQueryDto;
  const tours = listTours({
    query: query.query,
    ids: query.ids,
    limit: query.limit,
  });

  return c.json(successResponse({ tours }));
}

export async function getTour(c: Context) {
  const { id } = c.get("validatedParams") as TourIdParamsDto;
  const tour = getTourById(id);

  if (!tour) {
    throw new NotFoundError("Tour", id);
  }

  return c.json(successResponse({ tour }));
}

export async function postTour(c: Context) {
  const dto = c.get("validatedBody") as CreateTourDto;
  const tour = createTour({
    ...dto,
    bookingLink: normalizeTourImportUrl(dto.bookingLink),
    sourceUrl: dto.sourceUrl
      ? normalizeTourImportUrl(dto.sourceUrl)
      : dto.sourceUrl,
  });
  return c.json(successResponse({ tour }), 201);
}

export async function patchTour(c: Context) {
  const { id } = c.get("validatedParams") as TourIdParamsDto;
  const dto = c.get("validatedBody") as UpdateTourDto;
  const patch: Parameters<typeof updateTour>[1] = { ...dto };

  if (dto.bookingLink !== undefined) {
    patch.bookingLink = normalizeTourImportUrl(dto.bookingLink);
  }
  if (dto.sourceUrl !== undefined && dto.sourceUrl) {
    patch.sourceUrl = normalizeTourImportUrl(dto.sourceUrl);
  }
  if (dto.locationKey !== undefined) {
    patch.locationKey =
      dto.locationKey === null || dto.locationKey === ""
        ? null
        : dto.locationKey.trim();
  }

  const tour = updateTour(id, patch);
  return c.json(successResponse({ tour }));
}
