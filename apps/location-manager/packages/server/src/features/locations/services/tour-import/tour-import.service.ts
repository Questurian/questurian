import { BadRequestError } from "@shared/errors/http-error";
import { getTourByBookingLink } from "../../repositories/core";
import { cleanDisplayTitle } from "./title-suggestion";
import { detectTourSourceProvider, normalizeTourImportUrl } from "./provider-detection";
import { formatTourDisplayPrice } from "./price-format";
import { scrapeViatorProduct } from "./providers/viator";
import type { TourDraftPreview, ViatorProduct } from "./types";

function mapViatorProductToDraft(product: ViatorProduct): TourDraftPreview {
  const sourceUrl = normalizeTourImportUrl(product.url);
  return {
    provider: "viator",
    sourceUrl,
    sourceProductCode: product.productCode,
    sourceTitle: product.sourceTitle ?? "",
    sourceImageUrl: product.imageUrl,
    displayTitle: cleanDisplayTitle(product.sourceTitle ?? ""),
    bookingLink: sourceUrl,
    price: formatTourDisplayPrice(product.priceFrom, product.currency),
    description: product.description,
    duration: product.duration,
    supplier: product.supplier,
    rating: product.rating,
    reviewCount: product.reviewCount,
    duplicateTour: getTourByBookingLink(sourceUrl),
  };
}

export class TourImportService {
  async previewByUrl(rawUrl: string): Promise<TourDraftPreview> {
    let sourceUrl: string;
    try {
      sourceUrl = normalizeTourImportUrl(rawUrl);
    } catch {
      throw new BadRequestError("Enter a valid absolute URL", {
        code: "INVALID_TOUR_IMPORT_URL",
        url: rawUrl,
      });
    }

    const provider = detectTourSourceProvider(sourceUrl);
    if (!provider) {
      throw new BadRequestError("Unsupported tour URL", {
        code: "UNSUPPORTED_TOUR_URL",
        url: sourceUrl,
      });
    }

    if (provider === "viator") {
      return mapViatorProductToDraft(await scrapeViatorProduct(sourceUrl));
    }

    throw new BadRequestError("Unsupported tour provider", {
      code: "UNSUPPORTED_TOUR_PROVIDER",
      provider,
      url: sourceUrl,
    });
  }
}
