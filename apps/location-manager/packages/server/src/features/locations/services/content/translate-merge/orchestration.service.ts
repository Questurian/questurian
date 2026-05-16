import { EnvConfig } from "@server/shared/config/env.config";
import { TranslationApiClient } from "../../integrations/clients/translation-api.client";
import {
  saveMergedReviewsFile,
  saveRejectsReportFile,
} from "../../../repositories/content/translate-merge-reviews.repository";
import { MIN_USABLE_REVIEW_COUNT } from "../../../constants/translate-merge-reviews.constants";
import type {
  MergedReviewsUsability,
  RejectsReportFile,
  TranslateMergeOptions,
  TranslateMergeRejectsReport,
  TranslateMergeResult,
} from "../../../types/translate-merge-reviews.types";
import { TranslateMergeError } from "./errors";
import { prefilterByLengthAndDate, sortAndCount } from "./filtering.service";
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

function evaluateUsability(count: number): MergedReviewsUsability {
  if (count < MIN_USABLE_REVIEW_COUNT) {
    return { unusable: true, unusableReason: "too_few_reviews" };
  }
  return { unusable: false, unusableReason: null };
}

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
  console.log(`[Translate & Merge] Total reviews before pre-filter: ${allReviews.length}`);
  console.log(`[Translate & Merge]   - Google: ${stats.googleReviews}`);
  console.log(`[Translate & Merge]   - TripAdvisor (unique): ${stats.tripadvisorReviews}`);

  const prefiltered = prefilterByLengthAndDate(allReviews);
  console.log(
    `[Translate & Merge] Pre-filter (raw text): kept ${prefiltered.kept.length}/${allReviews.length} (short: ${prefiltered.filteredOutShort}, old: ${prefiltered.filteredOutOld}, invalid date: ${prefiltered.filteredOutInvalidDate})`
  );

  const translationStep = await translateReviews(
    locationId,
    prefiltered.kept,
    translationClient,
    config.LEADS_API_URL
  );
  stats.translated = translationStep.stats.translated;
  stats.alreadyEnglish = translationStep.stats.alreadyEnglish;
  stats.errors = translationStep.stats.errors;

  const finalized = sortAndCount(translationStep.mergedReviews);

  console.log(
    `[Translate & Merge] Final counts - Google: ${finalized.finalGoogleCount}, TripAdvisor: ${finalized.finalTripAdvisorCount}, Total: ${finalized.filteredReviews.length}`
  );

  const usability = evaluateUsability(finalized.filteredReviews.length);
  if (usability.unusable) {
    console.warn(
      `[Translate & Merge] Merged reviews flagged unusable: ${finalized.filteredReviews.length} < MIN_USABLE_REVIEW_COUNT (${MIN_USABLE_REVIEW_COUNT}). Reason: ${usability.unusableReason}`
    );
  }

  const timestamp = Date.now();
  const outputStats = {
    totalReviews: finalized.filteredReviews.length,
    googleReviews: finalized.finalGoogleCount,
    tripadvisorReviews: finalized.finalTripAdvisorCount,
    translated: finalized.finalTranslatedCount,
    alreadyEnglish: finalized.finalAlreadyEnglishCount,
    errors: stats.errors,
  };
  const outputData = {
    locationId,
    mergedAt: new Date().toISOString(),
    stats: outputStats,
    usability,
    reviews: finalized.filteredReviews,
  };

  const mergedFile = await saveMergedReviewsFile(locationId, timestamp, outputData);
  console.log(
    `[Translate & Merge] Saved ${finalized.filteredReviews.length} merged reviews to ${mergedFile.filename}`
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
    message: usability.unusable
      ? `Merged ${finalized.filteredReviews.length} reviews — below usable threshold (${MIN_USABLE_REVIEW_COUNT}); consumers should fall back to pure-AI mode`
      : `Successfully merged ${finalized.filteredReviews.length} reviews`,
    filename: mergedFile.filename,
    stats: outputStats,
    usability,
    rejectsReport: rejectsSummary,
  };
}

export {
  getMergedReviewsDownloadPayload,
  getMergedReviewsReportPayload,
  getMergedReviewsStatusPayload,
  getRejectsReportDownloadPayload,
};
