import type { LocationCategory } from "../../../models/location";
import { BadRequestError } from "@shared/errors/http-error";
import { isValidIdealForTag } from "@shared/types/location-ideal-for";
import {
  extractTripadvisorLocationId,
  filterTripadvisorFeatures,
  normalizeTripadvisorStringList,
  normalizeTripadvisorUrl,
} from "../../../utils/tripadvisor-utils";

export function normalizeJsonField(
  fieldName: string,
  input?: Record<string, unknown> | string | null,
  transform?: (value: Record<string, unknown>) => Record<string, unknown>
): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return trimmed;
      }
      return JSON.stringify(transform ? transform(parsed as Record<string, unknown>) : parsed);
    } catch {
      throw new BadRequestError(`${fieldName} must be valid JSON`);
    }
  }

  return JSON.stringify(transform ? transform(input) : input);
}

export function stripNightlifeSpendLevel(value: Record<string, unknown>): Record<string, unknown> {
  const details = value.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return value;

  const detailsRecord = details as Record<string, unknown>;
  const scene = detailsRecord.theScene;
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) return value;

  const sceneRecord = scene as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(sceneRecord, "spendLevel")) return value;

  const nextScene = { ...sceneRecord };
  delete nextScene.spendLevel;

  return {
    ...value,
    details: {
      ...detailsRecord,
      theScene: nextScene,
    },
  };
}

export function normalizeSelectedPayloadMediaSetIds(
  input?: string[] | null
): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;

  const normalized = Array.from(
    new Set(input.map((id) => id.trim()).filter((id) => id.length > 0))
  );

  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

export function normalizeTourIds(input?: number[]): number[] | undefined {
  if (input === undefined) return undefined;
  return Array.from(new Set(input.filter((id) => Number.isInteger(id) && id > 0)));
}

export function validateIdealForTagsByCategory(
  category: LocationCategory,
  input?: string[]
): void {
  if (category === "attractions") return;
  if (!input) return;

  const uniqueTags = Array.from(new Set(input.map((tag) => tag.trim()).filter(Boolean)));
  const invalidTags = uniqueTags.filter((tag) => !isValidIdealForTag(category, tag));

  if (invalidTags.length > 0) {
    throw new BadRequestError(
      `Invalid Ideal For tags for ${category}: ${invalidTags.join(", ")}`
    );
  }
}

export function resolveTripadvisorFields(
  tripadvisorUrl?: string | null
): { tripadvisorUrl?: string | null; tripadvisorLocationId?: string | null } {
  if (tripadvisorUrl === undefined) return {};
  if (tripadvisorUrl === null) return { tripadvisorUrl: null, tripadvisorLocationId: null };

  const normalizedUrl = normalizeTripadvisorUrl(tripadvisorUrl);
  if (!normalizedUrl) {
    throw new BadRequestError("TripAdvisor URL cannot be empty");
  }

  const locationId = extractTripadvisorLocationId(normalizedUrl);
  if (!locationId) {
    throw new BadRequestError(
      "Invalid TripAdvisor URL. Expected pattern: ...-g<geoId>-d<locationId>-Reviews-..."
    );
  }

  return {
    tripadvisorUrl: normalizedUrl,
    tripadvisorLocationId: locationId,
  };
}

export function normalizeTripadvisorList(
  input?: string[] | string | null,
  options?: { filterFeatures?: boolean }
): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;

  const normalizeAndStringify = (raw: unknown): string | null => {
    const normalized = normalizeTripadvisorStringList(raw);
    const processed = options?.filterFeatures
      ? filterTripadvisorFeatures(normalized)
      : normalized;
    return processed ? JSON.stringify(processed) : null;
  };

  if (Array.isArray(input)) {
    return normalizeAndStringify(input);
  }

  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    const fromJson = normalizeAndStringify(parsed);
    if (fromJson !== null) return fromJson;
  } catch {
    // Accept comma/newline-separated input below.
  }

  const split = trimmed
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalizeAndStringify(split);
}

export function normalizeIdealForTags(input?: string[]): string | undefined {
  if (input === undefined) return undefined;
  const normalized = Array.from(
    new Set(input.map((tag) => tag.trim()).filter((tag) => tag.length > 0))
  );
  return JSON.stringify(normalized);
}

export function shouldPersistIdealFor(category: LocationCategory): boolean {
  return category !== "attractions";
}
