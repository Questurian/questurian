import type { Context } from "hono";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { EnvConfig } from "@server/shared/config/env.config";
import { TranslationApiClient } from "@server/shared/services/external/translation-api.client";
import { successResponse, errorResponse } from "@shared/types/api-response";

const config = EnvConfig.getInstance();
const translationClient = new TranslationApiClient(config);

// Unified review format for merged output
export interface UnifiedReview {
  id: string;
  source: "google" | "tripadvisor";
  review_text: string | null;
  title: string | null;
  rating: number | null;
  review_datetime_utc: string | null;
  review_photos: string[] | null;
  original_language: string | null;
  was_translated: boolean;
  author_name: string | null;
}

export type ReviewSource = "google" | "tripadvisor";

export interface TranslateMergeOptions {
  includeGoogle?: boolean;
  includeTripadvisor?: boolean;
}

export interface TranslateMergeStats {
  totalReviews: number;
  googleReviews: number;
  tripadvisorReviews: number;
  translated: number;
  alreadyEnglish: number;
  errors: number;
}

export interface TranslateMergeRejectsReport {
  filename: string;
  totalRejected: number;
  replacedWithEnglish: number;
  rejectedNonEnglish: number;
}

export interface TranslateMergeResult {
  message: string;
  filename: string;
  stats: TranslateMergeStats;
  rejectsReport: TranslateMergeRejectsReport | null;
}

class TranslateMergeError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

// Data directories
const GOOGLE_REVIEWS_DIR = path.join(process.cwd(), "data", "reviews");
const TRIPADVISOR_REVIEWS_DIR = path.join(process.cwd(), "data", "tripadvisor-reviews");
const MERGED_REVIEWS_DIR = path.join(process.cwd(), "data", "merged-reviews");
const MIN_REVIEW_CHAR_COUNT = 150;
const MIN_REVIEW_DATE_TIMESTAMP = Date.UTC(2023, 0, 1);

function normalizeLanguage(value?: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase();
}

function isEnglishLanguage(value?: string | null): boolean {
  const normalized = normalizeLanguage(value);
  if (!normalized) return false;
  if (normalized === "en" || normalized === "english") return true;
  return normalized.startsWith("en-") || normalized.startsWith("en_");
}

function looksLikeEnglishText(text?: string | null): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Reject if there are lots of non-Latin characters (very unlikely in English)
  const nonAscii = trimmed.match(/[^\x00-\x7F]/g);
  if (nonAscii && nonAscii.length > Math.max(3, trimmed.length * 0.05)) {
    return false;
  }

  const tokens = trimmed.toLowerCase().match(/[a-z']+/g) || [];
  if (tokens.length === 0) return false;

  const common = new Set([
    "the", "and", "is", "it", "to", "of", "in", "for", "on", "with", "this", "that", "was", "we",
    "you", "they", "he", "she", "as", "at", "be", "are", "were", "have", "has", "had", "but", "not",
    "very", "good", "great", "nice", "food", "service", "place", "staff", "would", "recommend",
  ]);

  const hits = tokens.filter((token) => common.has(token)).length;
  if (hits >= 2) return true;
  return hits / tokens.length >= 0.08;
}

function isReviewLongEnough(review: UnifiedReview): boolean {
  const text = review.review_text?.trim() ?? "";
  return text.length >= MIN_REVIEW_CHAR_COUNT;
}

function getReviewTimestamp(review: UnifiedReview): number | null {
  const dateValue = review.review_datetime_utc?.trim();
  if (!dateValue) return null;
  const timestamp = Date.parse(dateValue);
  if (Number.isNaN(timestamp)) return null;
  return timestamp;
}


async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Get the latest Google reviews file for a location
 */
async function getLatestGoogleReviewsFile(locationId: number): Promise<string | null> {
  if (!existsSync(GOOGLE_REVIEWS_DIR)) {
    return null;
  }

  const files = await readdir(GOOGLE_REVIEWS_DIR);
  const locationFiles = files
    .filter((f) => f.startsWith(`reviews_location_${locationId}_`) && f.endsWith(".json"))
    .sort()
    .reverse();

  if (locationFiles.length === 0) {
    return null;
  }

  return path.join(GOOGLE_REVIEWS_DIR, locationFiles[0]!);
}

/**
 * Get all TripAdvisor review files for a location (one per language)
 */
async function getAllTripAdvisorReviewFiles(locationId: number): Promise<string[]> {
  if (!existsSync(TRIPADVISOR_REVIEWS_DIR)) {
    return [];
  }

  const files = await readdir(TRIPADVISOR_REVIEWS_DIR);

  // Group by language and get the latest for each
  const languageLatest = new Map<string, { file: string; timestamp: number }>();

  for (const file of files) {
    if (!file.startsWith(`tripadvisor_reviews_${locationId}_`) || !file.endsWith(".json")) {
      continue;
    }

    const match = file.match(/^tripadvisor_reviews_\d+_([a-z-]+)_(\d+)\.json$/i);
    if (!match) continue;

    const language = match[1]!;
    const timestamp = parseInt(match[2]!, 10);

    const existing = languageLatest.get(language);
    if (!existing || timestamp > existing.timestamp) {
      languageLatest.set(language, { file, timestamp });
    }
  }

  return Array.from(languageLatest.values()).map((v) => path.join(TRIPADVISOR_REVIEWS_DIR, v.file));
}

/**
 * Parse Google reviews from stored data
 */
function parseGoogleReviews(data: unknown): UnifiedReview[] {
  const storedData = data as {
    response?: {
      data?: {
        reviews?: Array<{
          review_id?: string;
          review_text?: string | null;
          rating?: number;
          review_rating?: number;
          review_datetime_utc?: string;
          review_photos?: string[] | null;
          review_language?: string;
          author_name?: string;
        }>;
        reviews_data?: Array<{
          review_id?: string;
          review_text?: string | null;
          rating?: number;
          review_rating?: number;
          review_datetime_utc?: string;
          review_photos?: string[] | null;
          review_language?: string;
          author_name?: string;
        }>;
      };
    };
  };

  const reviews = storedData.response?.data?.reviews
    || storedData.response?.data?.reviews_data
    || [];

  return reviews.map((review) => ({
    id: review.review_id || `google_${Date.now()}_${Math.random()}`,
    source: "google" as const,
    review_text: review.review_text ?? null,
    title: null, // Google reviews don't have titles
    rating: review.rating ?? review.review_rating ?? null,
    review_datetime_utc: review.review_datetime_utc ?? null,
    review_photos: Array.isArray(review.review_photos) ? review.review_photos : null,
    original_language: review.review_language ?? null,
    was_translated: false,
    author_name: review.author_name ?? null,
  }));
}

/**
 * Parse TripAdvisor reviews from stored data
 *
 * IMPORTANT: TripAdvisor data has confusing field names:
 * - `language`: The CURRENT language of the text (what we need to translate FROM)
 * - `original_language`: The language the reviewer ORIGINALLY wrote in
 * - `is_translated`: Whether TripAdvisor translated it (from original_language to language)
 *
 * Example: A review written in English, displayed in Spanish file:
 *   language: "es" (text is IN Spanish)
 *   original_language: "en" (reviewer wrote in English)
 *   is_translated: true (TripAdvisor translated EN -> ES)
 *
 * We need to translate if `language` (current text language) is not "en"
 */
function parseTripAdvisorReviews(data: unknown): UnifiedReview[] {
  const storedData = data as {
    language?: string;
    reviews?: Array<{
      review_id?: number;
      title?: string;
      text?: string;
      rating?: number;
      published_at_date?: string;
      images?: string[];
      language?: string; // Current language of the text
      original_language?: string;
      is_translated?: boolean;
      reviewer?: {
        name?: string;
      };
    }>;
  };

  const reviews = storedData.reviews || [];
  const fileLanguage = storedData.language || "en";

  return reviews.map((review) => ({
    id: review.review_id ? `tripadvisor_${review.review_id}` : `tripadvisor_${Date.now()}_${Math.random()}`,
    source: "tripadvisor" as const,
    review_text: review.text ?? null,
    title: review.title ?? null,
    rating: review.rating ?? null,
    review_datetime_utc: review.published_at_date ?? null,
    review_photos: Array.isArray(review.images) && review.images.length > 0 ? review.images : null,
    // Use the CURRENT text language (review.language or file language), NOT original_language
    original_language: review.language || fileLanguage,
    was_translated: false, // We haven't translated it yet - we need to translate TO English
    author_name: review.reviewer?.name ?? null,
  }));
}

/**
 * Check if a review needs translation (not in English)
 */
function needsTranslation(review: UnifiedReview): boolean {
  if (review.source === "google" && looksLikeEnglishText(review.review_text)) {
    return false;
  }
  return !isEnglishLanguage(review.original_language) && !review.was_translated;
}

/**
 * Collect all reviews, translate non-English ones, and merge into a single file
 */
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
  console.log(`[Translate & Merge] ========================================`);
  console.log(`[Translate & Merge] Sources: Google=${includeGoogle ? "on" : "off"}, TripAdvisor=${includeTripadvisor ? "on" : "off"}`);

  // Collect all reviews
  const allReviews: UnifiedReview[] = [];
  const stats = {
    googleReviews: 0,
    tripadvisorReviews: 0,
    needsTranslation: 0,
    translated: 0,
    alreadyEnglish: 0,
    errors: 0,
  };

  // 1. Load Google reviews
  if (includeGoogle) {
    const googleFile = await getLatestGoogleReviewsFile(locationId);
    console.log(`[Translate & Merge] Google file: ${googleFile || "NOT FOUND"}`);
    if (googleFile) {
      try {
        const content = await Bun.file(googleFile).text();
        const data = JSON.parse(content);
        const googleReviews = parseGoogleReviews(data);
        allReviews.push(...googleReviews);
        stats.googleReviews = googleReviews.length;
        console.log(`[Translate & Merge] Loaded ${googleReviews.length} Google reviews`);
      } catch (error) {
        console.error(`[Translate & Merge] Error loading Google reviews:`, error);
      }
    }
  } else {
    console.log(`[Translate & Merge] Skipping Google reviews (source not selected)`);
  }

  // 2. Load TripAdvisor reviews (all languages)
  // We need to deduplicate by review_id, preferring English versions
  const tripadvisorReviewsMap = new Map<string, UnifiedReview>();
  const tripadvisorFiles = await getAllTripAdvisorReviewFiles(locationId);

  // Track rejected duplicates for the report
  interface RejectedReview {
    review_id: string;
    action: "rejected_non_english" | "replaced_with_english";
    reason: string;
    kept: {
      language: string;
      title: string | null;
      review_text_preview: string | null;
      source_file: string;
    };
    rejected: {
      language: string;
      title: string | null;
      review_text_preview: string | null;
      source_file: string;
    };
  }
  const rejectedReviews: RejectedReview[] = [];

  if (includeTripadvisor) {
    const tripadvisorFiles = await getAllTripAdvisorReviewFiles(locationId);

    console.log(`[Translate & Merge] Found ${tripadvisorFiles.length} TripAdvisor files:`);
    tripadvisorFiles.forEach((f) => console.log(`  - ${path.basename(f)}`));

    // Sort files so English files are processed LAST (so they overwrite non-English duplicates)
    const sortedFiles = tripadvisorFiles.sort((a, b) => {
      const aIsEnglish = a.includes("_en_");
      const bIsEnglish = b.includes("_en_");
      if (aIsEnglish && !bIsEnglish) return 1; // English comes last
      if (!aIsEnglish && bIsEnglish) return -1;
      return 0;
    });

    // Track which file each review came from
    const reviewSourceFile = new Map<string, string>();

    let totalTripAdvisorLoaded = 0;
    for (const file of sortedFiles) {
      const filename = path.basename(file);
      try {
        const content = await Bun.file(file).text();
        const data = JSON.parse(content);
        const tripadvisorReviews = parseTripAdvisorReviews(data);
        totalTripAdvisorLoaded += tripadvisorReviews.length;

        const beforeSize = tripadvisorReviewsMap.size;
        for (const review of tripadvisorReviews) {
          const existing = tripadvisorReviewsMap.get(review.id);
          const truncate = (s: string | null, len = 100) => s ? (s.length > len ? s.slice(0, len) + "..." : s) : null;

          if (!existing) {
            // New unique review
            tripadvisorReviewsMap.set(review.id, review);
            reviewSourceFile.set(review.id, filename);
          } else if (isEnglishLanguage(review.original_language)) {
            // Replace non-English with English version
            rejectedReviews.push({
              review_id: review.id,
              action: "replaced_with_english",
              reason: `English version preferred over ${existing.original_language} version`,
              kept: {
                language: review.original_language || "unknown",
                title: review.title,
                review_text_preview: truncate(review.review_text),
                source_file: filename,
              },
              rejected: {
                language: existing.original_language || "unknown",
                title: existing.title,
                review_text_preview: truncate(existing.review_text),
                source_file: reviewSourceFile.get(review.id) || "unknown",
              },
            });
            tripadvisorReviewsMap.set(review.id, review);
            reviewSourceFile.set(review.id, filename);
          } else {
            // Reject this non-English duplicate (keep existing)
            rejectedReviews.push({
              review_id: review.id,
              action: "rejected_non_english",
              reason: `Duplicate rejected - keeping ${existing.original_language} version`,
              kept: {
                language: existing.original_language || "unknown",
                title: existing.title,
                review_text_preview: truncate(existing.review_text),
                source_file: reviewSourceFile.get(review.id) || "unknown",
              },
              rejected: {
                language: review.original_language || "unknown",
                title: review.title,
                review_text_preview: truncate(review.review_text),
                source_file: filename,
              },
            });
          }
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
    console.log(`[Translate & Merge] Skipping TripAdvisor reviews (source not selected)`);
  }
  // Add deduplicated TripAdvisor reviews to allReviews
  const uniqueTripAdvisorReviews = Array.from(tripadvisorReviewsMap.values());
  allReviews.push(...uniqueTripAdvisorReviews);
  stats.tripadvisorReviews = uniqueTripAdvisorReviews.length;

  if (allReviews.length === 0) {
    throw new TranslateMergeError("No reviews found. Please fetch reviews first.", 404);
  }

  console.log(`[Translate & Merge] ----------------------------------------`);
  console.log(`[Translate & Merge] Total reviews before translation: ${allReviews.length}`);
  console.log(`[Translate & Merge]   - Google: ${stats.googleReviews}`);
  console.log(`[Translate & Merge]   - TripAdvisor (unique): ${stats.tripadvisorReviews}`);

  // 3. Identify reviews that need translation
  const reviewsToTranslate = allReviews.filter(needsTranslation);
  const alreadyEnglishReviews = allReviews.filter((r) => !needsTranslation(r));
  stats.needsTranslation = reviewsToTranslate.length;
  stats.alreadyEnglish = alreadyEnglishReviews.length;

  console.log(`[Translate & Merge] ----------------------------------------`);
  console.log(`[Translate & Merge] Need translation: ${reviewsToTranslate.length}`);
  console.log(`[Translate & Merge] Already English: ${alreadyEnglishReviews.length}`);
  console.log(`[Translate & Merge] Sum check: ${reviewsToTranslate.length} + ${alreadyEnglishReviews.length} = ${reviewsToTranslate.length + alreadyEnglishReviews.length} (should equal ${allReviews.length})`);

  // 4. Translate non-English reviews
  let translatedReviews: UnifiedReview[] = [];

  if (reviewsToTranslate.length > 0) {
    console.log(`[Translate & Merge] Preparing to translate ${reviewsToTranslate.length} reviews`);
    console.log(`[Translate & Merge] Sample languages: ${reviewsToTranslate.slice(0, 5).map(r => r.original_language).join(", ")}`);
    console.log(`[Translate & Merge] Translation API URL: ${config.LEADS_API_URL}`);

    if (!translationClient.isConfigured()) {
      console.warn("[Translate & Merge] Translation API not configured - skipping translation step");
      translatedReviews = reviewsToTranslate.map((r) => ({
        ...r,
        was_translated: false,
      }));
      stats.errors = reviewsToTranslate.length;
    } else {
      try {
        // Prepare reviews for translation API
        const reviewsForApi = reviewsToTranslate.map((r) => ({
          id: r.id,
          review_text: r.review_text,
          title: r.title,
        }));

        console.log(`[Translate & Merge] Calling translation API with ${reviewsForApi.length} reviews...`);

        const translationResult = await translationClient.translateReviews({
          reviews: reviewsForApi,
          fields_to_translate: ["review_text", "title"],
          source_language: "auto",
        });

        stats.translated = translationResult.stats.translated;
        stats.errors = translationResult.stats.errors;

        // Map translated content back to unified reviews
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
        console.error(`[Translate & Merge] Translation error:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Translate & Merge] Error details: ${errorMessage}`);
        // If translation fails, use original reviews
        translatedReviews = reviewsToTranslate.map((r) => ({
          ...r,
          was_translated: false,
        }));
        stats.errors = reviewsToTranslate.length;
      }
    }
  } else {
    console.log(`[Translate & Merge] No reviews need translation - all are already in English`);
  }

  // 5. Merge all reviews (already English + newly translated)
  // Put already-English first so they take priority in deduplication
  const mergedReviews = [...alreadyEnglishReviews, ...translatedReviews];

  console.log(`[Translate & Merge] ----------------------------------------`);
  console.log(`[Translate & Merge] After translation:`);
  console.log(`[Translate & Merge]   - Already English: ${alreadyEnglishReviews.length}`);
  console.log(`[Translate & Merge]   - Translated: ${translatedReviews.length}`);
  console.log(`[Translate & Merge]   - Merged total: ${mergedReviews.length}`);

  // 6. Deduplicate by ID (in case there are any remaining duplicates)
  // Using a Map where already-English reviews (added first) take priority
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

  // 7. Filter for thoughtful, recent reviews
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

  // 8. Sort by date (newest first)
  filteredReviews.sort((a, b) => {
    const dateA = a.review_datetime_utc ? new Date(a.review_datetime_utc).getTime() : 0;
    const dateB = b.review_datetime_utc ? new Date(b.review_datetime_utc).getTime() : 0;
    return dateB - dateA;
  });

  // 9. Calculate final stats
  const finalGoogleCount = filteredReviews.filter((r) => r.source === "google").length;
  const finalTripAdvisorCount = filteredReviews.filter((r) => r.source === "tripadvisor").length;
  const finalTranslatedCount = filteredReviews.filter((r) => r.was_translated).length;
  const finalAlreadyEnglishCount = filteredReviews.filter((r) => !r.was_translated).length;

  console.log(`[Translate & Merge] Final counts - Google: ${finalGoogleCount}, TripAdvisor: ${finalTripAdvisorCount}, Total: ${filteredReviews.length}`);

  // 10. Save merged reviews
  await ensureDir(MERGED_REVIEWS_DIR);
  const timestamp = Date.now();
  const filename = `merged_reviews_${locationId}_${timestamp}.json`;
  const filepath = path.join(MERGED_REVIEWS_DIR, filename);

  const outputData = {
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

  await Bun.write(filepath, JSON.stringify(outputData, null, 2));

  // 11. Save rejects report (if any duplicates were found)
  if (rejectedReviews.length > 0) {
    const rejectsFilename = `rejects_report_${locationId}_${timestamp}.json`;
    const rejectsFilepath = path.join(MERGED_REVIEWS_DIR, rejectsFilename);

    const rejectsReport = {
      locationId,
      generatedAt: new Date().toISOString(),
      summary: {
        totalRejected: rejectedReviews.length,
        replacedWithEnglish: rejectedReviews.filter((r) => r.action === "replaced_with_english").length,
        rejectedNonEnglish: rejectedReviews.filter((r) => r.action === "rejected_non_english").length,
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

    await Bun.write(rejectsFilepath, JSON.stringify(rejectsReport, null, 2));
    console.log(`[Translate & Merge] Saved rejects report with ${rejectedReviews.length} entries to ${rejectsFilename}`);
  }

  console.log(`[Translate & Merge] Saved ${filteredReviews.length} merged reviews to ${filename}`);

  const rejectsReportSummary = rejectedReviews.length > 0
    ? {
        filename: `rejects_report_${locationId}_${timestamp}.json`,
        totalRejected: rejectedReviews.length,
        replacedWithEnglish: rejectedReviews.filter((r) => r.action === "replaced_with_english").length,
        rejectedNonEnglish: rejectedReviews.filter((r) => r.action === "rejected_non_english").length,
      }
    : null;

  return {
    message: `Successfully merged ${filteredReviews.length} reviews`,
    filename,
    stats: outputData.stats,
    rejectsReport: rejectsReportSummary,
  };
}

/**
 * POST /api/locations/:id/reviews/translate-merge
 * Collect all reviews, translate non-English ones, and merge into a single file
 */
export async function translateAndMergeReviews(c: Context) {
  const locationId = parseInt(c.req.param("id"));
  const body = await c.req.json<{ sources?: ReviewSource[] }>().catch(() => ({} as { sources?: ReviewSource[] }));

  const requestedSources = Array.isArray(body.sources) ? body.sources : null;
  const normalized = requestedSources?.map((source) => source.toLowerCase());
  const includeGoogle = requestedSources ? normalized?.includes("google") ?? false : true;
  const includeTripadvisor = requestedSources ? normalized?.includes("tripadvisor") ?? false : true;

  if (requestedSources && !includeGoogle && !includeTripadvisor) {
    return c.json(errorResponse("At least one source is required"), 400);
  }

  try {
    const result = await runTranslateAndMergeReviews(locationId, { includeGoogle, includeTripadvisor });
    return c.json(successResponse(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to translate and merge reviews";
    const status = error instanceof TranslateMergeError ? error.status : 500;
    return c.json(errorResponse(message), status);
  }
}

// Minimal review format for download (just text, rating, date)
interface MinimalReview {
  text: string;
  rating: number;
  date: string;
}

/**
 * GET /api/locations/:id/reviews/merged/download
 * Download the latest merged reviews file in minimal format (text, rating, date array)
 */
export async function downloadMergedReviews(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  if (!existsSync(MERGED_REVIEWS_DIR)) {
    return c.json(errorResponse("No merged reviews found. Please run translate & merge first."), 404);
  }

  const files = await readdir(MERGED_REVIEWS_DIR);
  const locationFiles = files
    .filter((f) => f.startsWith(`merged_reviews_${locationId}_`) && f.endsWith(".json"))
    .sort()
    .reverse();

  if (locationFiles.length === 0) {
    return c.json(errorResponse("No merged reviews found for this location. Please run translate & merge first."), 404);
  }

  const filepath = path.join(MERGED_REVIEWS_DIR, locationFiles[0]!);
  const content = await Bun.file(filepath).text();
  const data = JSON.parse(content) as {
    reviews: UnifiedReview[];
  };

  // Transform to minimal format: just text, rating, date
  const minimalReviews: MinimalReview[] = data.reviews
    .filter((r) => r.review_text) // Only include reviews with text
    .map((r) => ({
      text: r.review_text || "",
      rating: r.rating || 0,
      date: r.review_datetime_utc || "",
    }));

  const minimalContent = JSON.stringify(minimalReviews, null, 2);

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="reviews_${locationId}.json"`);

  return c.body(minimalContent);
}

/**
 * GET /api/locations/:id/reviews/merged/report
 * Get the full report data (stats, errors, translations) for display in a dialog
 */
export async function getMergedReviewsReport(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  if (!existsSync(MERGED_REVIEWS_DIR)) {
    return c.json(errorResponse("No merged reviews found. Please run translate & merge first."), 404);
  }

  const files = await readdir(MERGED_REVIEWS_DIR);
  const mergedFiles = files
    .filter((f) => f.startsWith(`merged_reviews_${locationId}_`) && f.endsWith(".json"))
    .sort()
    .reverse();

  if (mergedFiles.length === 0) {
    return c.json(errorResponse("No merged reviews found for this location. Please run translate & merge first."), 404);
  }

  // Load the merged reviews file
  const mergedFilepath = path.join(MERGED_REVIEWS_DIR, mergedFiles[0]!);
  const mergedContent = await Bun.file(mergedFilepath).text();
  const mergedData = JSON.parse(mergedContent) as {
    locationId: number;
    mergedAt: string;
    stats: TranslateMergeStats;
    reviews: UnifiedReview[];
  };

  // Check for rejects report with matching timestamp
  const timestamp = mergedFiles[0]!.match(/_(\d+)\.json$/)?.[1];
  let rejectsData = null;

  if (timestamp) {
    const rejectsFilename = `rejects_report_${locationId}_${timestamp}.json`;
    const rejectsFilepath = path.join(MERGED_REVIEWS_DIR, rejectsFilename);
    if (existsSync(rejectsFilepath)) {
      const rejectsContent = await Bun.file(rejectsFilepath).text();
      rejectsData = JSON.parse(rejectsContent);
    }
  }

  return c.json(
    successResponse({
      locationId: mergedData.locationId,
      mergedAt: mergedData.mergedAt,
      stats: mergedData.stats,
      rejectsReport: rejectsData
        ? {
            totalRejected: rejectsData.summary.totalRejected,
            replacedWithEnglish: rejectsData.summary.replacedWithEnglish,
            rejectedNonEnglish: rejectsData.summary.rejectedNonEnglish,
          }
        : null,
    })
  );
}

/**
 * GET /api/locations/:id/reviews/rejects/download
 * Download the latest rejects report for a location
 */
export async function downloadRejectsReport(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  if (!existsSync(MERGED_REVIEWS_DIR)) {
    return c.json(errorResponse("No rejects report found. Please run translate & merge first."), 404);
  }

  const files = await readdir(MERGED_REVIEWS_DIR);
  const locationFiles = files
    .filter((f) => f.startsWith(`rejects_report_${locationId}_`) && f.endsWith(".json"))
    .sort()
    .reverse();

  if (locationFiles.length === 0) {
    return c.json(errorResponse("No rejects report found for this location. This means no duplicates were detected during the merge."), 404);
  }

  const filepath = path.join(MERGED_REVIEWS_DIR, locationFiles[0]!);
  const content = await Bun.file(filepath).text();

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="${locationFiles[0]}"`);

  return c.body(content);
}

/**
 * GET /api/locations/:id/reviews/merged/status
 * Check if merged reviews exist for a location
 */
export async function getMergedReviewsStatus(c: Context) {
  const locationId = parseInt(c.req.param("id"));

  if (!existsSync(MERGED_REVIEWS_DIR)) {
    return c.json(
      successResponse({
        hasMergedReviews: false,
        filename: null,
        mergedAt: null,
        stats: null,
      })
    );
  }

  const files = await readdir(MERGED_REVIEWS_DIR);
  const locationFiles = files
    .filter((f) => f.startsWith(`merged_reviews_${locationId}_`) && f.endsWith(".json"))
    .sort()
    .reverse();

  if (locationFiles.length === 0) {
    return c.json(
      successResponse({
        hasMergedReviews: false,
        filename: null,
        mergedAt: null,
        stats: null,
      })
    );
  }

  const filepath = path.join(MERGED_REVIEWS_DIR, locationFiles[0]!);
  const content = await Bun.file(filepath).text();
  const data = JSON.parse(content);

  return c.json(
    successResponse({
      hasMergedReviews: true,
      filename: locationFiles[0],
      mergedAt: data.mergedAt,
      stats: data.stats,
    })
  );
}
