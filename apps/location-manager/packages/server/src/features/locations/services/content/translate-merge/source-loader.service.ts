import path from "node:path";
import {
  getAllTripAdvisorReviewFiles,
  getLatestGoogleReviewsFile,
  readJsonFile,
} from "../../../repositories/content/translate-merge-reviews.repository";
import type { RejectedReview, UnifiedReview } from "../../../types/translate-merge-reviews.types";
import { isEnglishLanguage } from "../../../utils/translate-merge-language.utils";
import { parseGoogleReviews, parseTripAdvisorReviews } from "../../../utils/translate-merge-parsers.utils";
import { truncateText } from "./helpers.utils";
import type { LoadSourceReviewsResult, TranslationRunStats } from "./types";

export async function loadSourceReviews(
  locationId: number,
  includeGoogle: boolean,
  includeTripadvisor: boolean
): Promise<LoadSourceReviewsResult> {
  const allReviews: UnifiedReview[] = [];
  const stats: TranslationRunStats = {
    googleReviews: 0,
    tripadvisorReviews: 0,
    needsTranslation: 0,
    translated: 0,
    alreadyEnglish: 0,
    errors: 0,
  };

  if (includeGoogle) {
    const googleFile = await getLatestGoogleReviewsFile(locationId);
    console.log(`[Translate & Merge] Google file: ${googleFile || "NOT FOUND"}`);

    if (googleFile) {
      try {
        const data = await readJsonFile<unknown>(googleFile);
        const googleReviews = parseGoogleReviews(data);
        allReviews.push(...googleReviews);
        stats.googleReviews = googleReviews.length;
        console.log(`[Translate & Merge] Loaded ${googleReviews.length} Google reviews`);
      } catch (error) {
        console.error("[Translate & Merge] Error loading Google reviews:", error);
      }
    }
  } else {
    console.log("[Translate & Merge] Skipping Google reviews (source not selected)");
  }

  const tripadvisorReviewsMap = new Map<string, UnifiedReview>();
  const rejectedReviews: RejectedReview[] = [];

  if (includeTripadvisor) {
    const tripadvisorFiles = await getAllTripAdvisorReviewFiles(locationId);

    console.log(`[Translate & Merge] Found ${tripadvisorFiles.length} TripAdvisor files:`);
    tripadvisorFiles.forEach((file) => console.log(`  - ${path.basename(file)}`));

    const sortedFiles = [...tripadvisorFiles].sort((a, b) => {
      const aIsEnglish = a.includes("_en_");
      const bIsEnglish = b.includes("_en_");
      if (aIsEnglish && !bIsEnglish) return 1;
      if (!aIsEnglish && bIsEnglish) return -1;
      return 0;
    });

    const reviewSourceFile = new Map<string, string>();
    let totalTripAdvisorLoaded = 0;

    for (const file of sortedFiles) {
      const filename = path.basename(file);

      try {
        const data = await readJsonFile<unknown>(file);
        const tripadvisorReviews = parseTripAdvisorReviews(data);
        totalTripAdvisorLoaded += tripadvisorReviews.length;

        const beforeSize = tripadvisorReviewsMap.size;
        for (const review of tripadvisorReviews) {
          const existing = tripadvisorReviewsMap.get(review.id);

          if (!existing) {
            tripadvisorReviewsMap.set(review.id, review);
            reviewSourceFile.set(review.id, filename);
            continue;
          }

          if (isEnglishLanguage(review.original_language)) {
            rejectedReviews.push({
              review_id: review.id,
              action: "replaced_with_english",
              reason: `English version preferred over ${existing.original_language} version`,
              kept: {
                language: review.original_language || "unknown",
                title: review.title,
                review_text_preview: truncateText(review.review_text),
                source_file: filename,
              },
              rejected: {
                language: existing.original_language || "unknown",
                title: existing.title,
                review_text_preview: truncateText(existing.review_text),
                source_file: reviewSourceFile.get(review.id) || "unknown",
              },
            });
            tripadvisorReviewsMap.set(review.id, review);
            reviewSourceFile.set(review.id, filename);
            continue;
          }

          rejectedReviews.push({
            review_id: review.id,
            action: "rejected_non_english",
            reason: `Duplicate rejected - keeping ${existing.original_language} version`,
            kept: {
              language: existing.original_language || "unknown",
              title: existing.title,
              review_text_preview: truncateText(existing.review_text),
              source_file: reviewSourceFile.get(review.id) || "unknown",
            },
            rejected: {
              language: review.original_language || "unknown",
              title: review.title,
              review_text_preview: truncateText(review.review_text),
              source_file: filename,
            },
          });
        }

        const afterSize = tripadvisorReviewsMap.size;
        const newUnique = afterSize - beforeSize;

        console.log(
          `[Translate & Merge] Loaded ${tripadvisorReviews.length} reviews from ${filename} (${newUnique} new unique, ${tripadvisorReviews.length - newUnique} duplicates)`
        );
      } catch (error) {
        console.error(`[Translate & Merge] Error loading TripAdvisor reviews from ${file}:`, error);
      }
    }

    console.log(
      `[Translate & Merge] Total TripAdvisor loaded: ${totalTripAdvisorLoaded}, Unique after dedup: ${tripadvisorReviewsMap.size}`
    );
    console.log(`[Translate & Merge] Rejected duplicates: ${rejectedReviews.length}`);
  } else {
    console.log("[Translate & Merge] Skipping TripAdvisor reviews (source not selected)");
  }

  const uniqueTripAdvisorReviews = Array.from(tripadvisorReviewsMap.values());
  allReviews.push(...uniqueTripAdvisorReviews);
  stats.tripadvisorReviews = uniqueTripAdvisorReviews.length;

  return { allReviews, rejectedReviews, stats };
}
