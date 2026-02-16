import path from "node:path";
import { EnvConfig } from "@server/shared/config/env.config";
import { TranslationApiClient } from "../integrations/clients/translation-api.client";
import { MIN_REVIEW_DATE_TIMESTAMP } from "../../constants/translate-merge-reviews.constants";
import {
  extractTimestampFromFilename,
  getAllTripAdvisorReviewFiles,
  getLatestGoogleReviewsFile,
  getLatestMergedReviewsFile,
  getLatestRejectsReportFile,
  getRejectsReportFileByTimestamp,
  mergedReviewsDirectoryExists,
  readJsonFile,
  readTextFile,
  saveMergedReviewsFile,
  saveRejectsReportFile,
} from "../../repositories/content/translate-merge-reviews.repository";
import type {
  MergedReviewsDownloadPayload,
  MergedReviewsFile,
  MergedReviewsReportPayload,
  MergedReviewsStatusPayload,
  MinimalReview,
  RejectedReview,
  RejectsReportFile,
  TranslateMergeOptions,
  TranslateMergeRejectsReport,
  TranslateMergeRejectsSummary,
  TranslateMergeResult,
  UnifiedReview,
} from "../../types/translate-merge-reviews.types";
import {
  getReviewTimestamp,
  isEnglishLanguage,
  isReviewLongEnough,
  needsTranslation,
} from "../../utils/translate-merge-language.utils";
import { parseGoogleReviews, parseTripAdvisorReviews } from "../../utils/translate-merge-parsers.utils";
import { TranslateMergeError } from "./translate-merge.errors";

const config = EnvConfig.getInstance();
const translationClient = new TranslationApiClient(config);

type TranslationRunStats = {
  googleReviews: number;
  tripadvisorReviews: number;
  needsTranslation: number;
  translated: number;
  alreadyEnglish: number;
  errors: number;
};

function truncateText(value: string | null, max = 100): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function countRejectedByAction(
  rejectedReviews: RejectedReview[],
  action: RejectedReview["action"]
): number {
  return rejectedReviews.filter((review) => review.action === action).length;
}

function buildRejectsSummary(
  locationId: number,
  timestamp: number,
  rejectedReviews: RejectedReview[]
): TranslateMergeRejectsReport {
  return {
    filename: `rejects_report_${locationId}_${timestamp}.json`,
    totalRejected: rejectedReviews.length,
    replacedWithEnglish: countRejectedByAction(rejectedReviews, "replaced_with_english"),
    rejectedNonEnglish: countRejectedByAction(rejectedReviews, "rejected_non_english"),
  };
}

function toMinimalReviews(reviews: UnifiedReview[]): MinimalReview[] {
  return reviews
    .filter((review) => review.review_text)
    .map((review) => ({
      text: review.review_text || "",
      rating: review.rating || 0,
      date: review.review_datetime_utc || "",
    }));
}

function getMissingMergedReviewsDirectoryError(): TranslateMergeError {
  return new TranslateMergeError("No merged reviews found. Please run translate & merge first.", 404);
}

function getMissingMergedReviewsForLocationError(): TranslateMergeError {
  return new TranslateMergeError(
    "No merged reviews found for this location. Please run translate & merge first.",
    404
  );
}

function getMissingRejectsDirectoryError(): TranslateMergeError {
  return new TranslateMergeError("No rejects report found. Please run translate & merge first.", 404);
}

function getMissingRejectsForLocationError(): TranslateMergeError {
  return new TranslateMergeError(
    "No rejects report found for this location. This means no duplicates were detected during the merge.",
    404
  );
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
  console.log(`[Translate & Merge] Sources: Google=${includeGoogle ? "on" : "off"}, TripAdvisor=${includeTripadvisor ? "on" : "off"}`);

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

        console.log(`[Translate & Merge] Loaded ${tripadvisorReviews.length} reviews from ${filename} (${newUnique} new unique, ${tripadvisorReviews.length - newUnique} duplicates)`);
      } catch (error) {
        console.error(`[Translate & Merge] Error loading TripAdvisor reviews from ${file}:`, error);
      }
    }

    console.log(`[Translate & Merge] Total TripAdvisor loaded: ${totalTripAdvisorLoaded}, Unique after dedup: ${tripadvisorReviewsMap.size}`);
    console.log(`[Translate & Merge] Rejected duplicates: ${rejectedReviews.length}`);
  } else {
    console.log("[Translate & Merge] Skipping TripAdvisor reviews (source not selected)");
  }

  const uniqueTripAdvisorReviews = Array.from(tripadvisorReviewsMap.values());
  allReviews.push(...uniqueTripAdvisorReviews);
  stats.tripadvisorReviews = uniqueTripAdvisorReviews.length;

  if (allReviews.length === 0) {
    throw new TranslateMergeError("No reviews found. Please fetch reviews first.", 404);
  }

  console.log("[Translate & Merge] ----------------------------------------");
  console.log(`[Translate & Merge] Total reviews before translation: ${allReviews.length}`);
  console.log(`[Translate & Merge]   - Google: ${stats.googleReviews}`);
  console.log(`[Translate & Merge]   - TripAdvisor (unique): ${stats.tripadvisorReviews}`);

  const reviewsToTranslate = allReviews.filter(needsTranslation);
  const alreadyEnglishReviews = allReviews.filter((review) => !needsTranslation(review));
  stats.needsTranslation = reviewsToTranslate.length;
  stats.alreadyEnglish = alreadyEnglishReviews.length;

  console.log("[Translate & Merge] ----------------------------------------");
  console.log(`[Translate & Merge] Need translation: ${reviewsToTranslate.length}`);
  console.log(`[Translate & Merge] Already English: ${alreadyEnglishReviews.length}`);
  console.log(`[Translate & Merge] Sum check: ${reviewsToTranslate.length} + ${alreadyEnglishReviews.length} = ${reviewsToTranslate.length + alreadyEnglishReviews.length} (should equal ${allReviews.length})`);

  let translatedReviews: UnifiedReview[] = [];
  if (reviewsToTranslate.length > 0) {
    console.log(`[Translate & Merge] Preparing to translate ${reviewsToTranslate.length} reviews`);
    console.log(`[Translate & Merge] Sample languages: ${reviewsToTranslate.slice(0, 5).map((review) => review.original_language).join(", ")}`);
    console.log(`[Translate & Merge] Translation API URL: ${config.LEADS_API_URL}`);

    if (!translationClient.isConfigured()) {
      console.warn("[Translate & Merge] Translation API not configured - skipping translation step");
      translatedReviews = reviewsToTranslate.map((review) => ({
        ...review,
        was_translated: false,
      }));
      stats.errors = reviewsToTranslate.length;
    } else {
      try {
        const reviewsForApi = reviewsToTranslate.map((review) => ({
          id: review.id,
          review_text: review.review_text,
          title: review.title,
        }));

        console.log(`[Translate & Merge] Calling translation API with ${reviewsForApi.length} reviews...`);
        const translationResult = await translationClient.translateReviews({
          reviews: reviewsForApi,
          fields_to_translate: ["review_text", "title"],
          source_language: "auto",
        });

        stats.translated = translationResult.stats.translated;
        stats.errors = translationResult.stats.errors;

        const translatedById = new Map<string, Record<string, unknown>>();
        for (const translated of translationResult.reviews) {
          const id = (translated as { id?: string | number }).id;
          if (id !== undefined && id !== null) {
            translatedById.set(String(id), translated);
          }
        }

        translatedReviews = reviewsToTranslate.map((original) => {
          const translated = translatedById.get(original.id);
          return {
            ...original,
            review_text: (translated?.review_text as string) ?? original.review_text,
            title: (translated?.title as string) ?? original.title,
            was_translated: true,
          };
        });

        console.log(`[Translate & Merge] Translation complete: ${stats.translated} translated, ${stats.errors} errors`);
      } catch (error) {
        console.error("[Translate & Merge] Translation error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Translate & Merge] Error details: ${errorMessage}`);
        translatedReviews = reviewsToTranslate.map((review) => ({
          ...review,
          was_translated: false,
        }));
        stats.errors = reviewsToTranslate.length;
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

  const reviewsMap = new Map<string, UnifiedReview>();
  for (const review of mergedReviews) {
    if (!reviewsMap.has(review.id)) {
      reviewsMap.set(review.id, review);
    }
  }
  const uniqueReviews = Array.from(reviewsMap.values());

  console.log(`[Translate & Merge]   - After final dedup: ${uniqueReviews.length}`);
  if (mergedReviews.length !== uniqueReviews.length) {
    console.log(`[Translate & Merge]   WARNING: Lost ${mergedReviews.length - uniqueReviews.length} reviews in final dedup!`);
  }

  let filteredOutShort = 0;
  let filteredOutOld = 0;
  let filteredOutInvalidDate = 0;
  const filteredReviews: UnifiedReview[] = [];

  for (const review of uniqueReviews) {
    if (!isReviewLongEnough(review)) {
      filteredOutShort += 1;
      continue;
    }

    const timestamp = getReviewTimestamp(review);
    if (timestamp === null) {
      filteredOutInvalidDate += 1;
      continue;
    }

    if (timestamp < MIN_REVIEW_DATE_TIMESTAMP) {
      filteredOutOld += 1;
      continue;
    }

    filteredReviews.push(review);
  }

  console.log(
    `[Translate & Merge] Filtered reviews: kept ${filteredReviews.length}/${uniqueReviews.length} (short: ${filteredOutShort}, old: ${filteredOutOld}, invalid date: ${filteredOutInvalidDate})`
  );
  if (filteredReviews.length === 0) {
    console.warn("[Translate & Merge] All reviews were filtered out by length/date criteria");
  }

  filteredReviews.sort((a, b) => {
    const dateA = a.review_datetime_utc ? new Date(a.review_datetime_utc).getTime() : 0;
    const dateB = b.review_datetime_utc ? new Date(b.review_datetime_utc).getTime() : 0;
    return dateB - dateA;
  });

  const finalGoogleCount = filteredReviews.filter((review) => review.source === "google").length;
  const finalTripAdvisorCount = filteredReviews.filter((review) => review.source === "tripadvisor").length;
  const finalTranslatedCount = filteredReviews.filter((review) => review.was_translated).length;
  const finalAlreadyEnglishCount = filteredReviews.filter((review) => !review.was_translated).length;

  console.log(`[Translate & Merge] Final counts - Google: ${finalGoogleCount}, TripAdvisor: ${finalTripAdvisorCount}, Total: ${filteredReviews.length}`);

  const timestamp = Date.now();
  const outputData: MergedReviewsFile = {
    locationId,
    mergedAt: new Date().toISOString(),
    stats: {
      totalReviews: filteredReviews.length,
      googleReviews: finalGoogleCount,
      tripadvisorReviews: finalTripAdvisorCount,
      translated: finalTranslatedCount,
      alreadyEnglish: finalAlreadyEnglishCount,
      errors: stats.errors,
    },
    reviews: filteredReviews,
  };

  const mergedFile = await saveMergedReviewsFile(locationId, timestamp, outputData);
  console.log(`[Translate & Merge] Saved ${filteredReviews.length} merged reviews to ${mergedFile.filename}`);

  let rejectsSummary: TranslateMergeRejectsSummary | null = null;
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
        whatWeDo: "We deduplicate by review_id, preferring English versions when available. This ensures each review appears only once in the final merged output.",
        actions: {
          replaced_with_english: "A non-English version was replaced with the English version of the same review",
          rejected_non_english: "A duplicate non-English version was rejected (we already had this review)",
        },
      },
      rejectedReviews,
    };

    const rejectsFile = await saveRejectsReportFile(locationId, timestamp, rejectsReport);
    console.log(`[Translate & Merge] Saved rejects report with ${rejectedReviews.length} entries to ${rejectsFile.filename}`);
    rejectsSummary = buildRejectsSummary(locationId, timestamp, rejectedReviews);
  }

  return {
    message: `Successfully merged ${filteredReviews.length} reviews`,
    filename: mergedFile.filename,
    stats: outputData.stats,
    rejectsReport: rejectsSummary,
  };
}

export async function getMergedReviewsDownloadPayload(
  locationId: number
): Promise<MergedReviewsDownloadPayload> {
  if (!mergedReviewsDirectoryExists()) {
    throw getMissingMergedReviewsDirectoryError();
  }

  const mergedFile = await getLatestMergedReviewsFile(locationId);
  if (!mergedFile) {
    throw getMissingMergedReviewsForLocationError();
  }

  const mergedData = await readJsonFile<MergedReviewsFile>(mergedFile.filepath);
  const minimalReviews = toMinimalReviews(mergedData.reviews);

  return {
    filename: `reviews_${locationId}.json`,
    content: JSON.stringify(minimalReviews, null, 2),
  };
}

export async function getMergedReviewsReportPayload(
  locationId: number
): Promise<MergedReviewsReportPayload> {
  if (!mergedReviewsDirectoryExists()) {
    throw getMissingMergedReviewsDirectoryError();
  }

  const mergedFile = await getLatestMergedReviewsFile(locationId);
  if (!mergedFile) {
    throw getMissingMergedReviewsForLocationError();
  }

  const mergedData = await readJsonFile<MergedReviewsFile>(mergedFile.filepath);
  const timestamp = extractTimestampFromFilename(mergedFile.filename);
  let rejectsSummary: TranslateMergeRejectsReport | null = null;

  if (timestamp) {
    const rejectsFile = await getRejectsReportFileByTimestamp(locationId, timestamp);
    if (rejectsFile) {
      const rejectsData = await readJsonFile<RejectsReportFile>(rejectsFile.filepath);
      rejectsSummary = {
        totalRejected: rejectsData.summary.totalRejected,
        replacedWithEnglish: rejectsData.summary.replacedWithEnglish,
        rejectedNonEnglish: rejectsData.summary.rejectedNonEnglish,
      };
    }
  }

  return {
    locationId: mergedData.locationId,
    mergedAt: mergedData.mergedAt,
    stats: mergedData.stats,
    rejectsReport: rejectsSummary,
  };
}

export async function getRejectsReportDownloadPayload(
  locationId: number
): Promise<MergedReviewsDownloadPayload> {
  if (!mergedReviewsDirectoryExists()) {
    throw getMissingRejectsDirectoryError();
  }

  const rejectsFile = await getLatestRejectsReportFile(locationId);
  if (!rejectsFile) {
    throw getMissingRejectsForLocationError();
  }

  return {
    filename: rejectsFile.filename,
    content: await readTextFile(rejectsFile.filepath),
  };
}

export async function getMergedReviewsStatusPayload(
  locationId: number
): Promise<MergedReviewsStatusPayload> {
  if (!mergedReviewsDirectoryExists()) {
    return {
      hasMergedReviews: false,
      filename: null,
      mergedAt: null,
      stats: null,
    };
  }

  const mergedFile = await getLatestMergedReviewsFile(locationId);
  if (!mergedFile) {
    return {
      hasMergedReviews: false,
      filename: null,
      mergedAt: null,
      stats: null,
    };
  }

  const mergedData = await readJsonFile<MergedReviewsFile>(mergedFile.filepath);
  return {
    hasMergedReviews: true,
    filename: mergedFile.filename,
    mergedAt: mergedData.mergedAt,
    stats: mergedData.stats,
  };
}
