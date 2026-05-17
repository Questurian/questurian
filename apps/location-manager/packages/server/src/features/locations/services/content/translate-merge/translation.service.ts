import {
  TranslationApiClient,
  TranslationApiError,
  type TranslateReviewsResponse,
} from "../../integrations/clients/translation-api.client";

const TRANSLATION_CHUNK_SIZE = 20;
const TRANSLATION_CONCURRENCY = 5;
const TRANSLATION_RETRY_BACKOFFS_MS = [1500];

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function translateChunkWithRetry(
  translationClient: TranslationApiClient,
  chunkReviews: { id: string; review_text: string | null; title: string | null }[]
): Promise<TranslateReviewsResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= TRANSLATION_RETRY_BACKOFFS_MS.length; attempt++) {
    try {
      return await translationClient.translateReviews({
        reviews: chunkReviews,
        fields_to_translate: ["review_text", "title"],
      });
    } catch (error) {
      lastError = error;
      const status = error instanceof TranslationApiError ? error.status : 0;
      const retryable = status === 0 /* network/timeout */ || isRetryableStatus(status);
      const hasBudget = attempt < TRANSLATION_RETRY_BACKOFFS_MS.length;
      if (!retryable || !hasBudget) {
        throw error;
      }
      const backoff = TRANSLATION_RETRY_BACKOFFS_MS[attempt];
      console.warn(
        `[Translate & Merge] Chunk failed (status=${status}); retrying in ${backoff}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw lastError;
}

async function dispatchWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}
import {
  cacheKey,
  lookupTranslations,
  upsertTranslations,
  type CachedTranslation,
  type TranslationCacheKey,
  type TranslationCacheUpsert,
} from "../../../repositories/content/translation-cache.repository";
import type { RejectedReview, UnifiedReview } from "../../../types/translate-merge-reviews.types";
import { needsTranslation } from "../../../utils/translate-merge-language.utils";
import { truncateText } from "./helpers.utils";
import type { TranslateReviewsResult } from "./types";

function buildTranslationFailedReject(review: UnifiedReview, reason: string): RejectedReview {
  return {
    review_id: review.id,
    action: "translation_failed",
    reason,
    kept: null,
    rejected: {
      language: review.original_language || "unknown",
      title: review.title,
      review_text_preview: truncateText(review.review_text),
      source_file: review.source,
    },
  };
}

function applyCachedTranslation(original: UnifiedReview, cached: CachedTranslation): UnifiedReview {
  return {
    ...original,
    review_text: cached.translatedText ?? original.review_text,
    title: cached.translatedTitle ?? original.title,
    was_translated: true,
  };
}

export async function translateReviews(
  locationId: number,
  allReviews: UnifiedReview[],
  translationClient: TranslationApiClient,
  leadsApiUrl: string
): Promise<TranslateReviewsResult> {
  const reviewsToTranslate = allReviews.filter(needsTranslation);
  const alreadyEnglishReviews = allReviews.filter((review) => !needsTranslation(review));

  console.log("[Translate & Merge] ----------------------------------------");
  console.log(`[Translate & Merge] Need translation: ${reviewsToTranslate.length}`);
  console.log(`[Translate & Merge] Already English: ${alreadyEnglishReviews.length}`);

  if (reviewsToTranslate.length === 0) {
    console.log("[Translate & Merge] No reviews need translation - all are already in English");
    return {
      mergedReviews: alreadyEnglishReviews,
      failedRejects: [],
      stats: {
        needsTranslation: 0,
        alreadyEnglish: alreadyEnglishReviews.length,
        translated: 0,
        translationFailed: 0,
        errors: 0,
      },
    };
  }

  const cacheKeys: TranslationCacheKey[] = reviewsToTranslate.map((review) => ({
    source: review.source,
    reviewId: review.id,
  }));
  const cache = lookupTranslations(cacheKeys);

  const cacheHits: UnifiedReview[] = [];
  const cacheMisses: UnifiedReview[] = [];
  for (const review of reviewsToTranslate) {
    const hit = cache.get(cacheKey(review.source, review.id));
    if (hit) {
      cacheHits.push(applyCachedTranslation(review, hit));
    } else {
      cacheMisses.push(review);
    }
  }

  console.log(
    `[Translate & Merge] Translation cache: ${cacheHits.length} hits, ${cacheMisses.length} misses`
  );

  const apiTranslatedReviews: UnifiedReview[] = [];
  const failedRejects: RejectedReview[] = [];
  let translatedViaApi = 0;
  let apiReportedErrors = 0;

  if (cacheMisses.length > 0) {
    console.log(`[Translate & Merge] Translation API URL: ${leadsApiUrl}`);

    if (!translationClient.isConfigured()) {
      console.warn(
        `[Translate & Merge] Translation API not configured — dropping ${cacheMisses.length} untranslated reviews`
      );
      for (const review of cacheMisses) {
        failedRejects.push(
          buildTranslationFailedReject(review, "Translation API not configured")
        );
      }
    } else {
      const chunks = chunkArray(cacheMisses, TRANSLATION_CHUNK_SIZE);
      console.log(
        `[Translate & Merge] Dispatching ${cacheMisses.length} reviews in ${chunks.length} chunk(s) of up to ${TRANSLATION_CHUNK_SIZE} (concurrency ${TRANSLATION_CONCURRENCY})`
      );

      const upserts: TranslationCacheUpsert[] = [];

      await dispatchWithConcurrency(chunks, TRANSLATION_CONCURRENCY, async (chunk, chunkIndex) => {
        const reviewsForApi = chunk.map((review) => ({
          id: review.id,
          review_text: review.review_text,
          title: review.title,
        }));

        let translationResult: TranslateReviewsResponse;
        try {
          translationResult = await translateChunkWithRetry(translationClient, reviewsForApi);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(
            `[Translate & Merge] Chunk ${chunkIndex + 1}/${chunks.length} failed: ${errorMessage}`
          );
          for (const review of chunk) {
            failedRejects.push(
              buildTranslationFailedReject(
                review,
                `Translation API call failed: ${errorMessage}`
              )
            );
          }
          return;
        }

        translatedViaApi += translationResult.stats.translated;
        apiReportedErrors += translationResult.stats.errors;

        const translatedById = new Map<string, Record<string, unknown>>();
        for (const translatedReview of translationResult.reviews) {
          const id = (translatedReview as { id?: string | number }).id;
          if (id !== undefined && id !== null) {
            translatedById.set(String(id), translatedReview);
          }
        }

        for (const original of chunk) {
          const translatedReview = translatedById.get(original.id);
          if (!translatedReview) {
            failedRejects.push(
              buildTranslationFailedReject(
                original,
                "Translation API response did not include this review id"
              )
            );
            continue;
          }

          const translatedText = translatedReview.review_text as string | undefined;
          const translatedTitle = translatedReview.title as string | undefined;
          if (!translatedText) {
            failedRejects.push(
              buildTranslationFailedReject(
                original,
                "Translation API returned empty review_text"
              )
            );
            continue;
          }

          upserts.push({
            source: original.source,
            reviewId: original.id,
            locationId,
            originalLanguage: original.original_language,
            translatedText,
            translatedTitle: translatedTitle ?? original.title,
          });

          apiTranslatedReviews.push({
            ...original,
            review_text: translatedText,
            title: translatedTitle ?? original.title,
            was_translated: true,
          });
        }
      });

      if (upserts.length > 0) {
        upsertTranslations(upserts);
        console.log(`[Translate & Merge] Cached ${upserts.length} new translations`);
      }

      console.log(
        `[Translate & Merge] Translation API: ${translatedViaApi} translated, ${apiReportedErrors} reported errors, ${failedRejects.length} dropped as translation_failed`
      );
    }
  }

  const mergedReviews = [...alreadyEnglishReviews, ...cacheHits, ...apiTranslatedReviews];

  console.log("[Translate & Merge] ----------------------------------------");
  console.log("[Translate & Merge] After translation:");
  console.log(`[Translate & Merge]   - Already English: ${alreadyEnglishReviews.length}`);
  console.log(`[Translate & Merge]   - From cache: ${cacheHits.length}`);
  console.log(`[Translate & Merge]   - Translated via API: ${apiTranslatedReviews.length}`);
  console.log(`[Translate & Merge]   - Translation failed (dropped): ${failedRejects.length}`);
  console.log(`[Translate & Merge]   - Merged total: ${mergedReviews.length}`);

  return {
    mergedReviews,
    failedRejects,
    stats: {
      needsTranslation: reviewsToTranslate.length,
      alreadyEnglish: alreadyEnglishReviews.length,
      translated: translatedViaApi + cacheHits.length,
      translationFailed: failedRejects.length,
      errors: apiReportedErrors,
    },
  };
}
