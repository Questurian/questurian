import type { ImageVariant } from "@questurian/lm-shared";
import type { LocationResponse, Upload } from "../../../shared/services/api/types";
import { toImageApiPath } from "../../../shared/components/location-media/gallery/location-media-gallery.utils";

export interface DiningHomepageCardPreviewModel {
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  alt: string;
}

export function mapLocationToDiningHomepageCardPreview(
  location: LocationResponse
): DiningHomepageCardPreviewModel {
  const title = firstNonBlank(location.title, location.source.name) ?? "Untitled location";
  const variant = findHomepageCardVariant(location.uploads);

  return {
    title,
    subtitle: firstNonBlank(location.district, location.type, location.locationKey),
    imageUrl: variant ? toImageApiPath(variant.path) : null,
    alt: title,
  };
}

function findHomepageCardVariant(uploads: Upload[]): ImageVariant | null {
  for (const upload of uploads) {
    const variants = (upload.imageSet?.variants ?? []).filter((variant) => variant.path.trim());
    if (variants.length === 0) continue;

    return (
      variants.find((variant) => variant.type === "wide") ??
      variants.find((variant) => variant.type === "square") ??
      variants[0] ??
      null
    );
  }

  return null;
}

function firstNonBlank(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }

  return null;
}
