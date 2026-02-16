import { MIN_REVIEW_CHAR_COUNT } from "../constants/translate-merge-reviews.constants";
import type { UnifiedReview } from "../types/translate-merge-reviews.types";

export function normalizeLanguage(value?: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase();
}

export function isEnglishLanguage(value?: string | null): boolean {
  const normalized = normalizeLanguage(value);
  if (!normalized) return false;
  if (normalized === "en" || normalized === "english") return true;
  return normalized.startsWith("en-") || normalized.startsWith("en_");
}

export function looksLikeEnglishText(text?: string | null): boolean {
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

export function isReviewLongEnough(review: UnifiedReview): boolean {
  const text = review.review_text?.trim() ?? "";
  return text.length >= MIN_REVIEW_CHAR_COUNT;
}

export function getReviewTimestamp(review: UnifiedReview): number | null {
  const dateValue = review.review_datetime_utc?.trim();
  if (!dateValue) return null;
  const timestamp = Date.parse(dateValue);
  if (Number.isNaN(timestamp)) return null;
  return timestamp;
}

export function needsTranslation(review: UnifiedReview): boolean {
  if (review.source === "google" && looksLikeEnglishText(review.review_text)) {
    return false;
  }
  return !isEnglishLanguage(review.original_language) && !review.was_translated;
}
