import type {
  ImageVariant,
  ImageVariantType,
} from "@questurian/lm-shared";
import { getFileExtension } from "../../../../utils/location-utils";
import type { PayloadVariantOverride } from "../../clients/payload/payload-media-set.types";
import type { LocationResponse } from "../../../../models/location";
import type { LocationUpload } from "./media-upload.types";

export const VARIANT_ORDER: ImageVariantType[] = [
  "thumbnail",
  "square",
  "wide",
  "open_graph",
  "editorial",
  "portrait",
  "hero",
];

const SOURCE_MIME_TYPE_BY_EXT: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export function inferSourceMimeType(path: string): string {
  const extension = getFileExtension(path).toLowerCase();
  return SOURCE_MIME_TYPE_BY_EXT[extension] ?? "image/webp";
}

export function buildVariantOverrides(
  variants: ImageVariant[],
): Partial<Record<ImageVariantType, PayloadVariantOverride>> | null {
  const overrides: Partial<Record<ImageVariantType, PayloadVariantOverride>> = {};
  for (const variant of variants) {
    if (!variant.cropRegion) {
      return null;
    }
    overrides[variant.type] = {
      left: variant.cropRegion.left,
      top: variant.cropRegion.top,
      width: variant.cropRegion.width,
      height: variant.cropRegion.height,
    };
  }
  return overrides;
}

export function formatMediaSetUploadLabel(
  imageSetId: string,
  upload: LocationUpload,
): string {
  const instagramMatch = imageSetId.match(/^instagram-(\d+)-(.+)$/);
  if (!instagramMatch) return imageSetId;

  const embedId = instagramMatch[1];
  const position = typeof upload.sourcePosition === "number" ? upload.sourcePosition + 1 : null;
  return position ? `Instagram ${embedId} image ${position}` : `Instagram ${embedId}`;
}

export function normalizePhotographerCredit(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function normalizeInstagramPhotographerCredit(username: string | undefined): string {
  if (!username) {
    return "Unknown";
  }

  const normalized = username.trim();
  if (!normalized) {
    return "Unknown";
  }

  return normalized.startsWith("@") ? normalized : `@${normalized}`;
}

export function createInstagramPostTitle(
  username: string,
  location: LocationResponse,
): string {
  const locationName = location.title || location.source.name;
  const cleanUsername = username.replace(/^@/, "");
  return `@${cleanUsername} at ${locationName}`;
}

export function toSafeFileToken(
  value: string | number | null | undefined,
  fallback: string,
): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }

  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

export function extractInstagramShortcode(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const match = url.match(/\/p\/([^/?#]+)/i);
  if (!match?.[1]) {
    return null;
  }

  return toSafeFileToken(match[1], "post");
}
