import { getLocationById } from "../../repositories/core/location-read.repository";
import {
  resolveEntityIdsByPayloadRefs,
  type PayloadRef,
  type PayloadCollectionSlug,
} from "../../repositories/integration/payload-sync.repository";
import {
  ensureReviewsDigest,
  type ReviewsDigestSummary,
} from "../content/reviews-digest.service";
import { AltTextApiClient } from "./clients/alt-text-api.client";

export interface EditorialLocation {
  entityId: number;
  name: string;
  category: string | null;
  type: string | null;
  priceLevel: string | null;
  address: string | null;
  neighborhoodDescription: string | null;
  website: string | null;
  menuUrl: string | null;
  reservationUrl: string | null;
  operationHours: unknown | null;
  cuisines: string[] | null;
  idealFor: string[] | null;
  features: string[] | null;
  mealTypes: string[] | null;
  reviewsCount: number | null;
  reviewsFetchedAt: string | null;
}

export type PayloadRefLookupResult =
  | {
      found: true;
      collection: PayloadCollectionSlug;
      docId: string;
      location: EditorialLocation;
      reviewsDigest: ReviewsDigestSummary | null;
    }
  | { found: false; collection: PayloadCollectionSlug; docId: string; reason: "no_sync_state" | "entity_missing" };

function safeParseJsonArray(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const filtered = parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return filtered.length > 0 ? filtered : null;
  } catch {
    return null;
  }
}

function safeParseJsonValue(raw: string | null | undefined): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export interface GetEditorialLocationsOptions {
  includeReviewsDigest?: boolean;
  /** Inject a client (test seam). Defaults to a fresh AltTextApiClient. */
  altTextApiClient?: AltTextApiClient;
}

export async function getEditorialLocationsByPayloadRefs(
  refs: PayloadRef[],
  options: GetEditorialLocationsOptions = {},
): Promise<PayloadRefLookupResult[]> {
  if (refs.length === 0) return [];

  const includeDigest = options.includeReviewsDigest !== false; // default true
  const client = options.altTextApiClient ?? new AltTextApiClient();

  const resolved = resolveEntityIdsByPayloadRefs(refs);
  const byKey = new Map<string, number>();
  for (const r of resolved) {
    byKey.set(`${r.collection}::${r.docId}`, r.entityId);
  }

  const tasks: Array<Promise<PayloadRefLookupResult>> = refs.map(async (ref): Promise<PayloadRefLookupResult> => {
    const entityId = byKey.get(`${ref.collection}::${ref.docId}`);
    if (entityId === undefined) {
      return { found: false, collection: ref.collection, docId: ref.docId, reason: "no_sync_state" };
    }

    const location = getLocationById(entityId);
    if (!location || location.id === undefined) {
      return { found: false, collection: ref.collection, docId: ref.docId, reason: "entity_missing" };
    }

    const editorial: EditorialLocation = {
      entityId: location.id,
      name: location.name,
      category: location.category ?? null,
      type: location.type ?? null,
      priceLevel: location.priceLevel ?? null,
      address: location.address ?? null,
      neighborhoodDescription: location.neighborhoodDescription ?? null,
      website: location.website ?? null,
      menuUrl: location.menuUrl ?? null,
      reservationUrl: location.reservationUrl ?? null,
      operationHours: safeParseJsonValue(location.hoursJson),
      cuisines: safeParseJsonArray(location.tripadvisorCuisinesJson),
      idealFor: safeParseJsonArray(location.idealForJson),
      features: safeParseJsonArray(location.tripadvisorFeaturesJson),
      mealTypes: safeParseJsonArray(location.tripadvisorMealTypesJson),
      reviewsCount: location.reviewsCount ?? null,
      reviewsFetchedAt: location.reviewsFetchedAt ?? null,
    };

    let reviewsDigest: ReviewsDigestSummary | null = null;
    if (
      includeDigest &&
      (editorial.reviewsCount ?? 0) > 0 &&
      editorial.category != null
    ) {
      reviewsDigest = await ensureReviewsDigest(
        location.id,
        {
          name: location.name,
          category: ref.collection, // use Payload slug; digest prompt branches on dining vs others
          location: location.address ?? null,
        },
        editorial.reviewsFetchedAt,
        client,
      );
    }

    return {
      found: true,
      collection: ref.collection,
      docId: ref.docId,
      location: editorial,
      reviewsDigest,
    };
  });

  return Promise.all(tasks);
}
