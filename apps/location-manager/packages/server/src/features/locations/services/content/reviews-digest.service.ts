import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { REVIEWS_DIGEST_DIR } from "../../constants/translate-merge-reviews.constants";
import { getLatestMergedReviewsFile } from "../../repositories/content/translate-merge-reviews.repository";
import {
  AltTextApiClient,
  type ReviewsDigestAiRequest,
  type ReviewsDigestAiResponse,
} from "../integrations/clients/alt-text-api.client";

const DIGEST_VERSION = 1;
const DIGEST_MAX_REVIEWS = 80;

export interface ReviewsDigestCacheEntry extends ReviewsDigestAiResponse {
  cached_at: string;
  source_fetched_at: string | null;
}

export interface ReviewsDigestSummary {
  version: number;
  knownFor: string[];
  commonPositives: string[];
  commonGripes: string[];
  namedDishes?: string[] | null;
  summary: string;
  sourceFetchedAt: string | null;
  reviewsConsidered: number;
}

interface MergedReviewRecord {
  id?: string;
  review_text?: string | null;
  rating?: number | null;
  review_datetime_utc?: string | null;
}

function digestFilepath(entityId: number): string {
  return path.join(REVIEWS_DIGEST_DIR, `reviews_digest_${entityId}.json`);
}

async function ensureDigestDir(): Promise<void> {
  if (!existsSync(REVIEWS_DIGEST_DIR)) {
    await mkdir(REVIEWS_DIGEST_DIR, { recursive: true });
  }
}

async function loadCachedDigest(entityId: number): Promise<ReviewsDigestCacheEntry | null> {
  const filepath = digestFilepath(entityId);
  if (!existsSync(filepath)) return null;
  try {
    const raw = await readFile(filepath, "utf8");
    return JSON.parse(raw) as ReviewsDigestCacheEntry;
  } catch {
    return null;
  }
}

function isCacheFresh(
  cached: ReviewsDigestCacheEntry,
  reviewsFetchedAt: string | null,
): boolean {
  if (cached.version !== DIGEST_VERSION) return false;
  // Treat any source-fetched-at mismatch as stale, including both being null
  // (no upstream reviews timestamp = we can't prove freshness).
  if (!cached.source_fetched_at || !reviewsFetchedAt) return false;
  return cached.source_fetched_at === reviewsFetchedAt;
}

function toApiResponse(cached: ReviewsDigestCacheEntry): ReviewsDigestAiResponse {
  const { cached_at: _c, source_fetched_at: _s, ...api } = cached;
  return api;
}

function toSummary(
  digest: ReviewsDigestAiResponse,
  reviewsFetchedAt: string | null,
): ReviewsDigestSummary {
  return {
    version: digest.version,
    knownFor: digest.knownFor,
    commonPositives: digest.commonPositives,
    commonGripes: digest.commonGripes,
    namedDishes: digest.namedDishes ?? null,
    summary: digest.summary,
    sourceFetchedAt: reviewsFetchedAt,
    reviewsConsidered: digest.reviews_considered,
  };
}

async function loadMergedReviews(entityId: number): Promise<MergedReviewRecord[] | null> {
  const ref = await getLatestMergedReviewsFile(entityId);
  if (!ref) return null;
  try {
    const raw = await readFile(ref.filepath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as MergedReviewRecord[];
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).reviews)) {
      return (parsed as { reviews: MergedReviewRecord[] }).reviews;
    }
    return null;
  } catch {
    return null;
  }
}

function toApiInput(
  venue: { name: string; category: string; location?: string | null },
  reviews: MergedReviewRecord[],
): ReviewsDigestAiRequest {
  const trimmed: ReviewsDigestAiRequest["reviews"] = [];
  for (const r of reviews) {
    const text = (r.review_text || "").trim();
    if (!text) continue;
    trimmed.push({
      text,
      rating: r.rating ?? null,
      date: r.review_datetime_utc ?? null,
    });
    if (trimmed.length >= DIGEST_MAX_REVIEWS) break;
  }
  return {
    venue_name: venue.name,
    venue_category: venue.category,
    venue_location: venue.location ?? null,
    reviews: trimmed,
  };
}

/**
 * Get-or-generate the Reviews Digest for one venue.
 * Returns null if the venue has no merged reviews or generation fails (degraded mode).
 *
 * @param entityId LM entity id (used for cache filename keying).
 * @param venue    Display info passed to the digest model.
 * @param reviewsFetchedAt LM's `reviewsFetchedAt` for this entity; used as the cache validity key.
 * @param client   AltTextApiClient instance (injected for test seams).
 */
export async function ensureReviewsDigest(
  entityId: number,
  venue: { name: string; category: string; location?: string | null },
  reviewsFetchedAt: string | null,
  client: AltTextApiClient,
): Promise<ReviewsDigestSummary | null> {
  const cached = await loadCachedDigest(entityId);
  if (cached && isCacheFresh(cached, reviewsFetchedAt)) {
    return toSummary(toApiResponse(cached), reviewsFetchedAt);
  }

  const reviews = await loadMergedReviews(entityId);
  if (!reviews || reviews.length === 0) {
    return null;
  }

  const input = toApiInput(venue, reviews);
  if (input.reviews.length === 0) {
    return null;
  }

  let digest: ReviewsDigestAiResponse;
  try {
    digest = await client.generateReviewsDigest(input);
  } catch (err) {
    console.warn(
      `[reviews-digest] generation failed for entity ${entityId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  await ensureDigestDir();
  const entry: ReviewsDigestCacheEntry = {
    ...digest,
    cached_at: new Date().toISOString(),
    source_fetched_at: reviewsFetchedAt,
  };
  try {
    await writeFile(digestFilepath(entityId), JSON.stringify(entry, null, 2));
  } catch (err) {
    console.warn(
      `[reviews-digest] cache write failed for entity ${entityId}:`,
      err instanceof Error ? err.message : err,
    );
  }
  return toSummary(digest, reviewsFetchedAt);
}
