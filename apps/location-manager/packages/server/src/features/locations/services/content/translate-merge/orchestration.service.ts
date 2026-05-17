import { createHash } from "node:crypto";
import { EnvConfig } from "@server/shared/config/env.config";
import { TranslationApiClient } from "../../integrations/clients/translation-api.client";
import {
  saveMergedReviewsFile,
  saveRejectsReportFile,
} from "../../../repositories/content/translate-merge-reviews.repository";
import {
  MIN_REVIEW_CHAR_COUNT,
  MIN_USABLE_REVIEW_COUNT,
  TRANSLATOR_VERSION,
  resolveMinReviewDateTimestamp,
} from "../../../constants/translate-merge-reviews.constants";
import type {
  MergedReviewsPipelineMeta,
  MergedReviewsSourceMeta,
  MergedReviewsUsability,
  RejectsReportFile,
  TranslateMergeOptions,
  TranslateMergeRejectsReport,
  TranslateMergeResult,
  TranslateMergeStats,
  UnifiedReview,
} from "../../../types/translate-merge-reviews.types";
import { MERGED_REVIEWS_SCHEMA_VERSION } from "../../../types/translate-merge-reviews.types";
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

const inFlightMerges = new Map<number, Promise<TranslateMergeResult>>();

function evaluateUsability(count: number): MergedReviewsUsability {
  if (count < MIN_USABLE_REVIEW_COUNT) {
    return { unusable: true, unusableReason: "too_few_reviews" };
  }
  return { unusable: false, unusableReason: null };
}

function computeContentHash(reviews: UnifiedReview[], pipeline: MergedReviewsPipelineMeta): string {
  // Normalise to a deterministic payload: sorted review ids + the filters that produced them.
  // Two merges with identical inputs and filters produce identical hashes regardless of run timestamp.
  const normalised = {
    pipeline: {
      translatorVersion: pipeline.translatorVersion,
      filters: pipeline.filters,
      schemaVersion: pipeline.schemaVersion,
    },
    reviews: [...reviews]
      .map((r) => ({
        id: r.id,
        source: r.source,
        review_text: r.review_text,
        title: r.title,
        rating: r.rating,
        review_datetime_utc: r.review_datetime_utc,
        original_language: r.original_language,
        was_translated: r.was_translated,
      }))
      .sort((a, b) => (a.source === b.source ? a.id.localeCompare(b.id) : a.source.localeCompare(b.source))),
  };
  return createHash("sha256").update(JSON.stringify(normalised)).digest("hex");
}

export async function runTranslateAndMergeReviews(
  locationId: number,
  options: TranslateMergeOptions = {}
): Promise<TranslateMergeResult> {
  if (inFlightMerges.has(locationId)) {
    throw new TranslateMergeError(
      `Merge already running for location ${locationId}. Wait for it to finish or refresh the page.`,
      409
    );
  }

  const run = executeTranslateAndMergeReviews(locationId, options);
  inFlightMerges.set(locationId, run);
  try {
    return await run;
  } finally {
    inFlightMerges.delete(locationId);
  }
}

async function executeTranslateAndMergeReviews(
  locationId: number,
  options: TranslateMergeOptions
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

  const { allReviews, rejectedReviews, stats, sourceMeta } = await loadSourceReviews(
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

  const minReviewDateTimestamp = resolveMinReviewDateTimestamp();
  const minReviewDateIso = new Date(minReviewDateTimestamp).toISOString().slice(0, 10);
  const prefiltered = prefilterByLengthAndDate(allReviews, minReviewDateTimestamp);
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
  stats.translationFailed = translationStep.stats.translationFailed;
  stats.errors = translationStep.stats.errors;

  if (translationStep.failedRejects.length > 0) {
    rejectedReviews.push(...translationStep.failedRejects);
  }

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
  const outputStats: TranslateMergeStats = {
    totalReviews: finalized.filteredReviews.length,
    googleReviews: finalized.finalGoogleCount,
    tripadvisorReviews: finalized.finalTripAdvisorCount,
    translated: finalized.finalTranslatedCount,
    alreadyEnglish: finalized.finalAlreadyEnglishCount,
    translationFailed: stats.translationFailed,
    errors: stats.errors,
  };

  const pipelineMeta: MergedReviewsPipelineMeta = {
    translatorVersion: TRANSLATOR_VERSION,
    filters: {
      minChars: MIN_REVIEW_CHAR_COUNT,
      minReviewDate: minReviewDateIso,
    },
    schemaVersion: MERGED_REVIEWS_SCHEMA_VERSION,
  };
  const sources: MergedReviewsSourceMeta = {
    google: sourceMeta.google,
    tripadvisor: sourceMeta.tripadvisor,
  };
  const contentHash = computeContentHash(finalized.filteredReviews, pipelineMeta);

  const outputData = {
    locationId,
    mergedAt: new Date().toISOString(),
    schemaVersion: MERGED_REVIEWS_SCHEMA_VERSION,
    contentHash,
    sources,
    pipeline: pipelineMeta,
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
        translationFailed: countRejectedByAction(rejectedReviews, "translation_failed"),
      },
      explanation: {
        why: "TripAdvisor returns the same reviews in different language files. Each review has a unique review_id that appears in multiple language files (e.g., both English and Spanish files). Additionally, reviews whose translation could not be completed are dropped from the merged dataset rather than mixed in as garbled non-English text.",
        whatWeDo:
          "We deduplicate by review_id, preferring English versions when available, and exclude any review whose translation failed.",
        actions: {
          replaced_with_english:
            "A non-English version was replaced with the English version of the same review",
          rejected_non_english:
            "A duplicate non-English version was rejected (we already had this review)",
          translation_failed:
            "A non-English review could not be translated and was excluded from the merged dataset; it remains recoverable via a future re-run.",
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
