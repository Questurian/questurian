import { EnvConfig } from "@server/shared/config/env.config";
import { TranslationApiClient } from "../../integrations/clients/translation-api.client";
import {
  saveMergedReviewsFile,
  saveRejectsReportFile,
} from "../../../repositories/content/translate-merge-reviews.repository";
import type {
  RejectsReportFile,
  TranslateMergeOptions,
  TranslateMergeRejectsReport,
  TranslateMergeResult,
} from "../../../types/translate-merge-reviews.types";
import { TranslateMergeError } from "./errors";
import { dedupeAndFilterReviews } from "./filtering.service";
import { buildRejectsSummary, countRejectedByAction } from "./helpers.utils";
import {
  getMergedReviewsDownloadPayload,
  getMergedReviewsReportPayload,
  getMergedReviewsStatusPayload,
  getRejectsReportDownloadPayload,
} from "./payloads.service";
import { loadSourceReviews } from "./source-loader.service";
import { translateReviews } from "./translation.service";

const config = EnvConfig.getInstance();
const translationClient = new TranslationApiClient(config);

export async function runTranslateAndMergeReviews(
  locationId: number,
  options: TranslateMergeOptions = {}
): Promise<TranslateMergeResult> {
  const includeGoogle = options.includeGoogle ?? true;
  const includeTripadvisor = options.includeTripadvisor ?? true;

  if (!includeGoogle && !includeTripadvisor) {
    throw new TranslateMergeError("At least one source is required", 400);
  }

  console.log(`[Translate & Merge] Starting for location ${locationId}`);
  console.log("[Translate & Merge] ========================================");
  console.log(
    `[Translate & Merge] Sources: Google=${includeGoogle ? "on" : "off"}, TripAdvisor=${includeTripadvisor ? "on" : "off"}`
  );

  const { allReviews, rejectedReviews, stats } = await loadSourceReviews(
    locationId,
    includeGoogle,
    includeTripadvisor
  );

  if (allReviews.length === 0) {
    throw new TranslateMergeError("No reviews found. Please fetch reviews first.", 404);
  }

  console.log("[Translate & Merge] ----------------------------------------");
  console.log(`[Translate & Merge] Total reviews before translation: ${allReviews.length}`);
  console.log(`[Translate & Merge]   - Google: ${stats.googleReviews}`);
  console.log(`[Translate & Merge]   - TripAdvisor (unique): ${stats.tripadvisorReviews}`);

  const translationStep = await translateReviews(allReviews, translationClient, config.LEADS_API_URL);
  stats.needsTranslation = translationStep.stats.needsTranslation;
  stats.alreadyEnglish = translationStep.stats.alreadyEnglish;
  stats.translated = translationStep.stats.translated;
  stats.errors = translationStep.stats.errors;

  const filtered = dedupeAndFilterReviews(translationStep.mergedReviews);

  console.log(
    `[Translate & Merge] Final counts - Google: ${filtered.finalGoogleCount}, TripAdvisor: ${filtered.finalTripAdvisorCount}, Total: ${filtered.filteredReviews.length}`
  );

  const timestamp = Date.now();
  const outputData = {
    locationId,
    mergedAt: new Date().toISOString(),
    stats: {
      totalReviews: filtered.filteredReviews.length,
      googleReviews: filtered.finalGoogleCount,
      tripadvisorReviews: filtered.finalTripAdvisorCount,
      translated: filtered.finalTranslatedCount,
      alreadyEnglish: filtered.finalAlreadyEnglishCount,
      errors: stats.errors,
    },
    reviews: filtered.filteredReviews,
  };

  const mergedFile = await saveMergedReviewsFile(locationId, timestamp, outputData);
  console.log(
    `[Translate & Merge] Saved ${filtered.filteredReviews.length} merged reviews to ${mergedFile.filename}`
  );

  let rejectsSummary: TranslateMergeRejectsReport | null = null;
  if (rejectedReviews.length > 0) {
    const rejectsReport: RejectsReportFile = {
      locationId,
      generatedAt: new Date().toISOString(),
      summary: {
        totalRejected: rejectedReviews.length,
        replacedWithEnglish: countRejectedByAction(rejectedReviews, "replaced_with_english"),
        rejectedNonEnglish: countRejectedByAction(rejectedReviews, "rejected_non_english"),
      },
      explanation: {
        why: "TripAdvisor returns the same reviews in different language files. Each review has a unique review_id that appears in multiple language files (e.g., both English and Spanish files).",
        whatWeDo:
          "We deduplicate by review_id, preferring English versions when available. This ensures each review appears only once in the final merged output.",
        actions: {
          replaced_with_english:
            "A non-English version was replaced with the English version of the same review",
          rejected_non_english:
            "A duplicate non-English version was rejected (we already had this review)",
        },
      },
      rejectedReviews,
    };

    const rejectsFile = await saveRejectsReportFile(locationId, timestamp, rejectsReport);
    console.log(
      `[Translate & Merge] Saved rejects report with ${rejectedReviews.length} entries to ${rejectsFile.filename}`
    );
    rejectsSummary = buildRejectsSummary(locationId, timestamp, rejectedReviews);
  }

  return {
    message: `Successfully merged ${filtered.filteredReviews.length} reviews`,
    filename: mergedFile.filename,
    stats: outputData.stats,
    rejectsReport: rejectsSummary,
  };
}

export {
  getMergedReviewsDownloadPayload,
  getMergedReviewsReportPayload,
  getMergedReviewsStatusPayload,
  getRejectsReportDownloadPayload,
};
