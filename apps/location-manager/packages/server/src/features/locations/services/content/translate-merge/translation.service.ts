import { TranslationApiClient } from "../../integrations/clients/translation-api.client";
import type { UnifiedReview } from "../../../types/translate-merge-reviews.types";
import { needsTranslation } from "../../../utils/translate-merge-language.utils";
import type { TranslateReviewsResult } from "./types";

export async function translateReviews(
  allReviews: UnifiedReview[],
  translationClient: TranslationApiClient,
  leadsApiUrl: string
): Promise<TranslateReviewsResult> {
  const reviewsToTranslate = allReviews.filter(needsTranslation);
  const alreadyEnglishReviews = allReviews.filter((review) => !needsTranslation(review));
  let translatedReviews: UnifiedReview[] = [];
  let translated = 0;
  let errors = 0;

  console.log("[Translate & Merge] ----------------------------------------");
  console.log(`[Translate & Merge] Need translation: ${reviewsToTranslate.length}`);
  console.log(`[Translate & Merge] Already English: ${alreadyEnglishReviews.length}`);
  console.log(
    `[Translate & Merge] Sum check: ${reviewsToTranslate.length} + ${alreadyEnglishReviews.length} = ${reviewsToTranslate.length + alreadyEnglishReviews.length} (should equal ${allReviews.length})`
  );

  if (reviewsToTranslate.length > 0) {
    console.log(`[Translate & Merge] Preparing to translate ${reviewsToTranslate.length} reviews`);
    console.log(
      `[Translate & Merge] Sample languages: ${reviewsToTranslate.slice(0, 5).map((review) => review.original_language).join(", ")}`
    );
    console.log(`[Translate & Merge] Translation API URL: ${leadsApiUrl}`);

    if (!translationClient.isConfigured()) {
      console.warn("[Translate & Merge] Translation API not configured - skipping translation step");
      translatedReviews = reviewsToTranslate.map((review) => ({
        ...review,
        was_translated: false,
      }));
      errors = reviewsToTranslate.length;
    } else {
      try {
        const reviewsForApi = reviewsToTranslate.map((review) => ({
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

        translatedReviews = reviewsToTranslate.map((original) => {
          const translatedReview = translatedById.get(original.id);
          return {
            ...original,
            review_text: (translatedReview?.review_text as string) ?? original.review_text,
            title: (translatedReview?.title as string) ?? original.title,
            was_translated: true,
          };
        });

        console.log(
          `[Translate & Merge] Translation complete: ${translated} translated, ${errors} errors`
        );
      } catch (error) {
        console.error("[Translate & Merge] Translation error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Translate & Merge] Error details: ${errorMessage}`);
        translatedReviews = reviewsToTranslate.map((review) => ({
          ...review,
          was_translated: false,
        }));
        errors = reviewsToTranslate.length;
      }
    }
  } else {
    console.log("[Translate & Merge] No reviews need translation - all are already in English");
  }

  const mergedReviews = [...alreadyEnglishReviews, ...translatedReviews];

  console.log("[Translate & Merge] ----------------------------------------");
  console.log("[Translate & Merge] After translation:");
  console.log(`[Translate & Merge]   - Already English: ${alreadyEnglishReviews.length}`);
  console.log(`[Translate & Merge]   - Translated: ${translatedReviews.length}`);
  console.log(`[Translate & Merge]   - Merged total: ${mergedReviews.length}`);

  return {
    mergedReviews,
    stats: {
      needsTranslation: reviewsToTranslate.length,
      alreadyEnglish: alreadyEnglishReviews.length,
      translated,
      errors,
    },
  };
}
