import { describe, expect, test } from "bun:test";
import {
  getReviewTimestamp,
  isEnglishLanguage,
  isReviewLongEnough,
  looksLikeEnglishText,
  needsTranslation,
  normalizeLanguage,
} from "./translate-merge-language.utils";
import type { UnifiedReview } from "../types/translate-merge-reviews.types";

function createReview(partial: Partial<UnifiedReview>): UnifiedReview {
  return {
    id: "review_1",
    source: "google",
    review_text: null,
    title: null,
    rating: null,
    review_datetime_utc: null,
    review_photos: null,
    original_language: null,
    was_translated: false,
    author_name: null,
    ...partial,
  };
}

describe("translate merge language utils", () => {
  test("normalizes language values", () => {
    expect(normalizeLanguage(" EN-us ")).toBe("en-us");
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
  });

  test("detects English language tags", () => {
    expect(isEnglishLanguage("en")).toBe(true);
    expect(isEnglishLanguage("english")).toBe(true);
    expect(isEnglishLanguage("en-US")).toBe(true);
    expect(isEnglishLanguage("en_US")).toBe(true);
    expect(isEnglishLanguage("es")).toBe(false);
    expect(isEnglishLanguage(undefined)).toBe(false);
  });

  test("identifies English-looking text and rejects non-Latin heavy text", () => {
    expect(
      looksLikeEnglishText("The food was great and the service was very good. We would recommend this place.")
    ).toBe(true);
    expect(looksLikeEnglishText("非常好吃，服务也很好，强烈推荐")).toBe(false);
    expect(looksLikeEnglishText("   ")).toBe(false);
  });

  test("computes translation necessity using source/language/text heuristics", () => {
    const googleSpanishButEnglishText = createReview({
      source: "google",
      review_text: "The place is great and the staff is nice.",
      original_language: "es",
      was_translated: false,
    });
    expect(needsTranslation(googleSpanishButEnglishText)).toBe(false);

    const tripadvisorSpanish = createReview({
      source: "tripadvisor",
      review_text: "Comida deliciosa",
      original_language: "es",
      was_translated: false,
    });
    expect(needsTranslation(tripadvisorSpanish)).toBe(true);

    const alreadyTranslated = createReview({
      source: "tripadvisor",
      original_language: "es",
      was_translated: true,
    });
    expect(needsTranslation(alreadyTranslated)).toBe(false);
  });

  test("applies length and timestamp constraints", () => {
    const longEnough = createReview({ review_text: "a".repeat(150) });
    const tooShort = createReview({ review_text: "a".repeat(149) });
    expect(isReviewLongEnough(longEnough)).toBe(true);
    expect(isReviewLongEnough(tooShort)).toBe(false);

    const validDate = createReview({ review_datetime_utc: "2024-01-01T00:00:00.000Z" });
    const invalidDate = createReview({ review_datetime_utc: "not-a-date" });
    expect(getReviewTimestamp(validDate)).toBe(1704067200000);
    expect(getReviewTimestamp(invalidDate)).toBeNull();
  });
});
