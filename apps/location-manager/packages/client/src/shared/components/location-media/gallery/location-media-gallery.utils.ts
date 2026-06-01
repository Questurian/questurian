import { VARIANT_SPECS } from "@questurian/lm-shared";
import type { Upload } from "@client/shared/services/api/types";

export const REQUIRED_VARIANT_COUNT = Object.keys(VARIANT_SPECS).length;

export function toImageApiPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const stripped = normalized
    .replace(/^\/+/, "")
    .replace(/^data\/images\//, "")
    .replace(/^packages\/server\/data\/images\//, "")
    .replace(/^apps\/location-manager\/packages\/server\/data\/images\//, "");
  return `/api/images/${stripped}`;
}

export function hasMissingPhotographerCredit(credit: string | null | undefined): boolean {
  return typeof credit !== "string" || credit.trim().length === 0;
}

export function normalizeInstagramHandle(username: string | undefined): string | undefined {
  if (!username?.trim()) return undefined;
  const normalized = username.trim();
  return normalized.startsWith("@") ? normalized : `@${normalized}`;
}

export function getMissingVariantCount(upload: Upload): number {
  return Math.max(0, REQUIRED_VARIANT_COUNT - (upload.imageSet?.variants?.length ?? 0));
}

export function getFileNameFromPath(path: string, fallback: string): string {
  return path.split("/").pop()?.trim() || fallback;
}
