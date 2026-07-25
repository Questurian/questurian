import type { Context } from "hono";
import { BadRequestError } from "@shared/errors/http-error";
import { successResponse } from "@shared/types/api-response";
import type {
  TourImportPreviewDto,
  TourSourceImageQueryDto,
  TourTitleSuggestionDto,
} from "../../validation/schemas/tours.schemas";
import { suggestTourDisplayTitle } from "../../services/tour-import/title-suggestion";
import { TourImportService } from "../../services/tour-import/tour-import.service";

const tourImportService = new TourImportService();

export async function postTourImportPreview(c: Context) {
  const dto = c.get("validatedBody") as TourImportPreviewDto;
  const draft = await tourImportService.previewByUrl(dto.url);
  return c.json(successResponse({ draft }));
}

export async function postTourTitleSuggestion(c: Context) {
  const dto = c.get("validatedBody") as TourTitleSuggestionDto;
  const suggestion = await suggestTourDisplayTitle(dto);
  return c.json(successResponse(suggestion));
}

export async function getTourSourceImage(c: Context) {
  const { url } = c.get("validatedQuery") as TourSourceImageQueryDto;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new BadRequestError("Tour source image download failed", {
      code: "TOUR_SOURCE_IMAGE_DOWNLOAD_FAILED",
      url,
      status: response.status,
      body: body.slice(0, 500),
    });
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    throw new BadRequestError("Tour source URL did not return an image", {
      code: "TOUR_SOURCE_IMAGE_NOT_IMAGE",
      url,
      contentType,
    });
  }

  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
