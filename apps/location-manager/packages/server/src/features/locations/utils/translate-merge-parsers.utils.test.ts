import { describe, expect, test } from "bun:test";
import { parseGoogleReviews, parseTripAdvisorReviews } from "./translate-merge-parsers.utils";

describe("translate merge parser utils", () => {
  test("parses Google reviews from response.data.reviews", () => {
    const parsed = parseGoogleReviews({
      response: {
        data: {
          reviews: [
            {
              review_id: "g_1",
              review_text: "Great place",
              review_rating: 5,
              review_datetime_utc: "2024-02-01T00:00:00.000Z",
              review_photos: ["a.jpg"],
              review_language: "en",
              author_name: "Ana",
            },
          ],
        },
      },
    });

    expect(parsed).toEqual([
      {
        id: "g_1",
        source: "google",
        review_text: "Great place",
        title: null,
        rating: 5,
        review_datetime_utc: "2024-02-01T00:00:00.000Z",
        review_photos: ["a.jpg"],
        original_language: "en",
        was_translated: false,
        author_name: "Ana",
      },
    ]);
  });

  test("falls back to Google reviews_data shape", () => {
    const parsed = parseGoogleReviews({
      response: {
        data: {
          reviews_data: [
            {
              review_id: "g_2",
              review_text: "Fallback shape",
              rating: 4,
              review_datetime_utc: "2024-03-01T00:00:00.000Z",
            },
          ],
        },
      },
    });

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe("g_2");
    expect(parsed[0]?.rating).toBe(4);
  });

  test("parses TripAdvisor reviews and uses current text language", () => {
    const parsed = parseTripAdvisorReviews({
      language: "es",
      reviews: [
        {
          review_id: 42,
          title: "Excelente",
          text: "Muy bueno",
          rating: 5,
          published_at_date: "2024-04-01",
          images: ["img.jpg"],
          language: "fr",
          original_language: "en",
          reviewer: { name: "Leo" },
        },
      ],
    });

    expect(parsed).toEqual([
      {
        id: "tripadvisor_42",
        source: "tripadvisor",
        review_text: "Muy bueno",
        title: "Excelente",
        rating: 5,
        review_datetime_utc: "2024-04-01",
        review_photos: ["img.jpg"],
        original_language: "fr",
        was_translated: false,
        author_name: "Leo",
      },
    ]);
  });

  test("uses file language when TripAdvisor review language is missing", () => {
    const parsed = parseTripAdvisorReviews({
      language: "es",
      reviews: [
        {
          review_id: 99,
          text: "Sin idioma en review",
        },
      ],
    });

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe("tripadvisor_99");
    expect(parsed[0]?.original_language).toBe("es");
  });
});
