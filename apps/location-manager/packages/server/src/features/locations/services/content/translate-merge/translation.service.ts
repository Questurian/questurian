import { TranslationApiClient } from "../../integrations/clients/translation-api.client";
import {
  cacheKey,
  lookupTranslations,
  upsertTranslations,
  type CachedTranslation,
  type TranslationCacheKey,
  type TranslationCacheUpsert,
} from "../../../repositories/content/translation-cache.repository";
import type { UnifiedReview } from "../../../types/translate-merge-reviews.types";
import { needsTranslation } from "../../../utils/translate-merge-language.utils";
import type { TranslateReviewsResult } from "./types";

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
      stats: {
        needsTranslation: 0,
        alreadyEnglish: alreadyEnglishReviews.length,
        translated: 0,
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

  let translated = 0;
  let errors = 0;
  let apiTranslatedReviews: UnifiedReview[] = [];

  if (cacheMisses.length > 0) {
    console.log(`[Translate & Merge] Translation API URL: ${leadsApiUrl}`);

    if (!translationClient.isConfigured()) {
      console.warn("[Translate & Merge] Translation API not configured - skipping translation step");
      apiTranslatedReviews = cacheMisses.map((review) => ({
        ...review,
        was_translated: false,
      }));
      errors = cacheMisses.length;
    } else {
      try {
        const reviewsForApi = cacheMisses.map((review) => ({
          id: review.id,
          review_text: review.review_text,
          title: review.title,
        }));

        console.log(
          `[Translate & Merge] Calling translation API with ${reviewsForApi.length} reviews...`
        );
        const translationResult = await translationClient.translateReviews({
          reviews: reviewsForApi,
          fields_to_translate: ["review_text", "title"],
          source_language: "auto",
        });

        translated = translationResult.stats.translated;
        errors = translationResult.stats.errors;

        const translatedById = new Map<string, Record<string, unknown>>();
        for (const translatedReview of translationResult.reviews) {
          const id = (translatedReview as { id?: string | number }).id;
          if (id !== undefined && id !== null) {
            translatedById.set(String(id), translatedReview);
          }
        }

        const upserts: TranslationCacheUpsert[] = [];
        apiTranslatedReviews = cacheMisses.map((original) => {
          const translatedReview = translatedById.get(original.id);
          const translatedText =
            (translatedReview?.review_text as string | undefined) ?? original.review_text;
          const translatedTitle =
            (translatedReview?.title as string | undefined) ?? original.title;

          if (translatedReview) {
            upserts.push({
              source: original.source,
              reviewId: original.id,
              locationId,
              originalLanguage: original.original_language,
              translatedText,
              translatedTitle,
            });
          }

          return {
            ...original,
            review_text: translatedText,
            title: translatedTitle,
            was_translated: true,
          };
        });

        if (upserts.length > 0) {
          upsertTranslations(upserts);
          console.log(`[Translate & Merge] Cached ${upserts.length} new translations`);
        }

        console.log(
          `[Translate & Merge] Translation complete: ${translated} translated, ${errors} errors`
        );
      } catch (error) {
        console.error("[Translate & Merge] Translation error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Translate & Merge] Error details: ${errorMessage}`);
        apiTranslatedReviews = cacheMisses.map((review) => ({
          ...review,
          was_translated: false,
        }));
        errors = cacheMisses.length;
      }
    }
  }

  const mergedReviews = [...alreadyEnglishReviews, ...cacheHits, ...apiTranslatedReviews];

  console.log("[Translate & Merge] ----------------------------------------");
  console.log("[Translate & Merge] After translation:");
  console.log(`[Translate & Merge]   - Already English: ${alreadyEnglishReviews.length}`);
  console.log(`[Translate & Merge]   - From cache: ${cacheHits.length}`);
  console.log(`[Translate & Merge]   - Translated via API: ${apiTranslatedReviews.length}`);
  console.log(`[Translate & Merge]   - Merged total: ${mergedReviews.length}`);

  return {
    mergedReviews,
    stats: {
      needsTranslation: reviewsToTranslate.length,
      alreadyEnglish: alreadyEnglishReviews.length,
      translated: translated + cacheHits.length,
      errors,
    },
  };
}
