import { describe, expect, test } from "bun:test";
import { executePipeline } from "../reviews-pipeline.controller";

const baseMergeStats = {
  translated: 0,
  alreadyEnglish: 0,
  translationFailed: 0,
  errors: 0,
};

describe("reviews pipeline inclusion", () => {
  test("google-only pipeline includes google reviews", async () => {
    let mergeArgs: [boolean, boolean] | null = null;

    const result = await executePipeline(
      1,
      { placeId: "place_1" },
      ["google"],
      {
        isGoogleConfigured: () => true,
        isTripadvisorConfigured: () => true,
        fetchGoogle: async () => ({
          message: "Google ok",
          reviewCount: 5,
          totalReviews: 5,
          hasMore: false,
          fetchedAt: new Date().toISOString(),
        }),
        fetchTripadvisor: async () => {
          throw new Error("TripAdvisor should not be called");
        },
        merge: async (_locationId, includeGoogle, includeTripadvisor) => {
          mergeArgs = [includeGoogle, includeTripadvisor];
          return {
            filename: "merged_google.json",
            stats: {
              totalReviews: 5,
              googleReviews: includeGoogle ? 5 : 0,
              tripadvisorReviews: includeTripadvisor ? 7 : 0,
              ...baseMergeStats,
            },
            usability: { unusable: false, unusableReason: null },
            rejectsReport: null,
          };
        },
      },
      () => undefined
    );

    expect(mergeArgs).toEqual([true, false]);
    expect(result.merged.stats.googleReviews).toBe(5);
    expect(result.merged.stats.tripadvisorReviews).toBe(0);
  });

  test("tripadvisor-only pipeline includes tripadvisor reviews", async () => {
    let mergeArgs: [boolean, boolean] | null = null;

    const result = await executePipeline(
      2,
      { tripadvisorUrl: "https://tripadvisor.example.com/abc" },
      ["tripadvisor"],
      {
        isGoogleConfigured: () => true,
        isTripadvisorConfigured: () => true,
        fetchGoogle: async () => {
          throw new Error("Google should not be called");
        },
        fetchTripadvisor: async () => ({
          message: "TripAdvisor ok",
          languages: [{ language: "en", reviewCount: 7, filePath: "file.json" }],
          totalReviews: 7,
          locationName: "Test",
          rating: 4.6,
        }),
        merge: async (_locationId, includeGoogle, includeTripadvisor) => {
          mergeArgs = [includeGoogle, includeTripadvisor];
          return {
            filename: "merged_tripadvisor.json",
            stats: {
              totalReviews: 7,
              googleReviews: includeGoogle ? 5 : 0,
              tripadvisorReviews: includeTripadvisor ? 7 : 0,
              ...baseMergeStats,
            },
            usability: { unusable: false, unusableReason: null },
            rejectsReport: null,
          };
        },
      },
      () => undefined
    );

    expect(mergeArgs).toEqual([false, true]);
    expect(result.merged.stats.googleReviews).toBe(0);
    expect(result.merged.stats.tripadvisorReviews).toBe(7);
  });

  test("google + tripadvisor pipeline includes both sources", async () => {
    let mergeArgs: [boolean, boolean] | null = null;

    const result = await executePipeline(
      3,
      { placeId: "place_3", tripadvisorUrl: "https://tripadvisor.example.com/xyz" },
      ["google", "tripadvisor"],
      {
        isGoogleConfigured: () => true,
        isTripadvisorConfigured: () => true,
        fetchGoogle: async () => ({
          message: "Google ok",
          reviewCount: 4,
          totalReviews: 4,
          hasMore: false,
          fetchedAt: new Date().toISOString(),
        }),
        fetchTripadvisor: async () => ({
          message: "TripAdvisor ok",
          languages: [{ language: "en", reviewCount: 6, filePath: "file.json" }],
          totalReviews: 6,
          locationName: "Test",
          rating: 4.9,
        }),
        merge: async (_locationId, includeGoogle, includeTripadvisor) => {
          mergeArgs = [includeGoogle, includeTripadvisor];
          return {
            filename: "merged_both.json",
            stats: {
              totalReviews: (includeGoogle ? 4 : 0) + (includeTripadvisor ? 6 : 0),
              googleReviews: includeGoogle ? 4 : 0,
              tripadvisorReviews: includeTripadvisor ? 6 : 0,
              ...baseMergeStats,
            },
            usability: { unusable: false, unusableReason: null },
            rejectsReport: null,
          };
        },
      },
      () => undefined
    );

    expect(mergeArgs).toEqual([true, true]);
    expect(result.merged.stats.totalReviews).toBe(10);
    expect(result.merged.stats.googleReviews).toBe(4);
    expect(result.merged.stats.tripadvisorReviews).toBe(6);
  });
});
