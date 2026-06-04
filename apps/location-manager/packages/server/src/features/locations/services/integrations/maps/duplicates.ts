import type { Location } from "../../../models/location";
import { BadRequestError } from "@shared/errors/http-error";
import { validateCategory } from "../../../utils/category-utils";
import { normalizeTripadvisorUrl } from "../../../utils/tripadvisor-utils";
import {
  findPotentialDuplicateLocations,
  updateLocationById,
} from "../maps.dependencies";
import type { MapsServiceOperationContext } from "./maps.types";

function normalizeAddressForDuplicateCheck(address: string): string {
  return address
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseStringArrayJson(input?: string | null): string[] {
  if (!input) return [];

  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];

    return Array.from(
      new Set(
        parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      )
    );
  } catch {
    return [];
  }
}

function mergeStringArrayJson(
  existingJson?: string | null,
  incomingJson?: string | null,
  maxItems?: number
): string | undefined {
  const incoming = parseStringArrayJson(incomingJson);
  if (incoming.length === 0) return undefined;

  const existing = parseStringArrayJson(existingJson);
  const merged = Array.from(new Set([...existing, ...incoming]));
  const limited = maxItems ? merged.slice(0, maxItems) : merged;

  if (limited.length === 0 || limited.join("|") === existing.join("|")) {
    return undefined;
  }

  return JSON.stringify(limited);
}

function scoreDuplicateCandidate(entry: Location, candidate: Location): number {
  let score = 0;
  const normalizedEntryAddress = normalizeAddressForDuplicateCheck(entry.address);
  const normalizedCandidateAddress = normalizeAddressForDuplicateCheck(candidate.address);

  if (normalizedEntryAddress === normalizedCandidateAddress) score += 40;

  if (
    entry.tripadvisorLocationId &&
    candidate.tripadvisorLocationId &&
    entry.tripadvisorLocationId === candidate.tripadvisorLocationId
  ) {
    score += 100;
  }

  if (entry.tripadvisorUrl && candidate.tripadvisorUrl) {
    const entryUrl = normalizeTripadvisorUrl(entry.tripadvisorUrl);
    const candidateUrl = normalizeTripadvisorUrl(candidate.tripadvisorUrl);

    if (entryUrl === candidateUrl) score += 70;
  }

  return score;
}

export function findDuplicateCandidate(entry: Location): Location | null {
  const candidates = findPotentialDuplicateLocations({
    address: entry.address,
    tripadvisorUrl: entry.tripadvisorUrl,
    tripadvisorLocationId: entry.tripadvisorLocationId,
  });

  const entryCategory = validateCategory(entry.category);
  const sameCategoryCandidates = candidates.filter(
    (candidate) => candidate.category === entryCategory
  );

  if (sameCategoryCandidates.length === 0) return null;

  const best = sameCategoryCandidates
    .map((candidate) => ({
      candidate,
      score: scoreDuplicateCandidate(entry, candidate),
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best) return null;

  const minimumScore = entry.tripadvisorLocationId
    ? 100
    : entry.tripadvisorUrl
      ? 110
      : 40;

  return best.score >= minimumScore ? best.candidate : null;
}

export async function mergeDuplicateLocation(
  context: MapsServiceOperationContext,
  existingLocation: Location,
  incomingEntry: Location,
  options: { allowNoFieldUpdates?: boolean } = {}
): Promise<number> {
  if (!existingLocation.id) {
    throw new BadRequestError("Duplicate location found without a valid ID");
  }

  const existingCategory = validateCategory(existingLocation.category);
  const incomingCategory = validateCategory(incomingEntry.category);

  if (existingCategory !== incomingCategory) {
    throw new BadRequestError(
      `Duplicate location detected. "${existingLocation.name}" already exists as "${existingCategory}".`
    );
  }

  const mergedIdealForJson = mergeStringArrayJson(
    existingLocation.idealForJson,
    incomingEntry.idealForJson,
    4
  );

  const updateData: Partial<Location> = {
    ...(mergedIdealForJson !== undefined && { idealForJson: mergedIdealForJson }),
    ...(!existingLocation.type && incomingEntry.type && { type: incomingEntry.type }),
    ...(!existingLocation.locationKey && incomingEntry.locationKey && { locationKey: incomingEntry.locationKey }),
    ...(!existingLocation.district && incomingEntry.district && { district: incomingEntry.district }),
    ...(!existingLocation.contactAddress && incomingEntry.contactAddress && { contactAddress: incomingEntry.contactAddress }),
    ...(!existingLocation.countryCode && incomingEntry.countryCode && { countryCode: incomingEntry.countryCode }),
    ...(!existingLocation.ianaTimeId && incomingEntry.ianaTimeId && { ianaTimeId: incomingEntry.ianaTimeId }),
    ...(!existingLocation.phoneNumber && incomingEntry.phoneNumber && { phoneNumber: incomingEntry.phoneNumber }),
    ...(!existingLocation.website && incomingEntry.website && { website: incomingEntry.website }),
    ...(!existingLocation.menuUrl && incomingEntry.menuUrl && { menuUrl: incomingEntry.menuUrl }),
    ...(!existingLocation.bookingUrl && incomingEntry.bookingUrl && { bookingUrl: incomingEntry.bookingUrl }),
    ...(!existingLocation.email && incomingEntry.email && { email: incomingEntry.email }),
    ...(!existingLocation.neighborhoodDescription && incomingEntry.neighborhoodDescription && { neighborhoodDescription: incomingEntry.neighborhoodDescription }),
    ...(!existingLocation.placeId && incomingEntry.placeId && { placeId: incomingEntry.placeId }),
    ...(!existingLocation.tripadvisorUrl && incomingEntry.tripadvisorUrl && { tripadvisorUrl: incomingEntry.tripadvisorUrl }),
    ...(!existingLocation.tripadvisorLocationId && incomingEntry.tripadvisorLocationId && { tripadvisorLocationId: incomingEntry.tripadvisorLocationId }),
    ...(!existingLocation.attractionsDetailsJson && incomingEntry.attractionsDetailsJson && { attractionsDetailsJson: incomingEntry.attractionsDetailsJson }),
    ...(!existingLocation.keyLocationsDetailsJson && incomingEntry.keyLocationsDetailsJson && { keyLocationsDetailsJson: incomingEntry.keyLocationsDetailsJson }),
    ...(!existingLocation.tripadvisorMealTypesJson && incomingEntry.tripadvisorMealTypesJson && { tripadvisorMealTypesJson: incomingEntry.tripadvisorMealTypesJson }),
    ...(!existingLocation.tripadvisorCuisinesJson && incomingEntry.tripadvisorCuisinesJson && { tripadvisorCuisinesJson: incomingEntry.tripadvisorCuisinesJson }),
    ...(!existingLocation.tripadvisorFeaturesJson && incomingEntry.tripadvisorFeaturesJson && { tripadvisorFeaturesJson: incomingEntry.tripadvisorFeaturesJson }),
  };

  if (Object.keys(updateData).length === 0) {
    if (options.allowNoFieldUpdates) return existingLocation.id;

    throw new BadRequestError(
      `Duplicate location detected. "${existingLocation.name}" already exists with the same category.`
    );
  }

  const merged = updateLocationById(existingLocation.id, updateData);
  if (!merged) {
    throw new BadRequestError("Failed to merge duplicate location fields");
  }

  const tripadvisorIdForFetch =
    incomingEntry.tripadvisorLocationId && !existingLocation.tripadvisorLocationId
      ? incomingEntry.tripadvisorLocationId
      : null;

  if (tripadvisorIdForFetch) {
    try {
      await context.tripAdvisorPlaceService.fetchAndMergePlaceData(
        existingLocation.id,
        tripadvisorIdForFetch
      );
    } catch (error) {
      console.error(
        `[MapsService] TripAdvisor auto-fetch failed during duplicate merge for location ${existingLocation.id}:`,
        error
      );
    }
  }

  return existingLocation.id;
}
