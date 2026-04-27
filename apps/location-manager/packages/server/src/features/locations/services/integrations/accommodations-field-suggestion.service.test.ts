import { describe, expect, test } from "bun:test";
import {
  AccommodationsFieldSuggestionService,
  normalizeAiResponse,
  resolveFieldDefinition,
  validateSuggestionValue,
} from "./accommodations-field-suggestion.service";
import type { AltTextApiClient } from "./clients/alt-text-api.client";

describe("accommodations field suggestion validation", () => {
  test("rejects unknown values and mixed-case aliases", () => {
    const definition = resolveFieldDefinition({
      fieldKey: "wifi",
      formValues: { name: "Hotel", address: "123 Main St" },
    });

    expect(validateSuggestionValue(definition, "yes")).toBe("yes");
    expect(validateSuggestionValue(definition, "YES")).toBeNull();
    expect(validateSuggestionValue(definition, "available")).toBeNull();
  });

  test("validates and dedupes multi-select values", () => {
    const definition = resolveFieldDefinition({
      fieldKey: "pool",
      formValues: { name: "Hotel", address: "123 Main St" },
    });

    expect(validateSuggestionValue(definition, ["outdoor", "outdoor", "rooftop"])).toEqual([
      "outdoor",
      "rooftop",
    ]);
    expect(validateSuggestionValue(definition, ["Outdoor"])).toBeNull();
  });

  test("rejects AI responses with extra keys", () => {
    const definition = resolveFieldDefinition({
      fieldKey: "price",
      formValues: { name: "Hotel", address: "123 Main St" },
    });

    const response = normalizeAiResponse("price", definition, {
      suggestion: "$$$",
      confidence: 0.9,
      reason: "Official site positions the hotel as upscale.",
      sources: [],
      unsupported: true,
    } as never);

    expect(response.suggestion).toBeNull();
    expect(response.error).toContain("unsupported keys");
  });

  test("normalizes a valid single-select AI response", () => {
    const definition = resolveFieldDefinition({
      fieldKey: "price",
      formValues: { name: "Hotel", address: "123 Main St" },
    });

    const response = normalizeAiResponse("price", definition, {
      suggestion: "$$$",
      confidence: 0.82,
      reason: "Rates and positioning match a premium property.",
      sources: [{ label: "Official site", url: "https://example.com" }],
    });

    expect(response.suggestion).toBe("$$$");
    expect(response.confidence).toBe(0.82);
    expect(response.sources[0]?.url).toBe("https://example.com");
  });

  test("normalizes a valid multi-select AI response", () => {
    const definition = resolveFieldDefinition({
      fieldKey: "perfectFor",
      formValues: { name: "Hotel", address: "123 Main St" },
    });

    const response = normalizeAiResponse("perfectFor", definition, {
      suggestion: ["Couples", "Groups"],
      confidence: 0.77,
      reason: "The property advertises suites and event-friendly stays.",
      sources: [],
    });

    expect(response.suggestion).toEqual(["Couples", "Groups"]);
  });
});

describe("AccommodationsFieldSuggestionService", () => {
  test("uses Google/Foursquare prefill hints before calling AI", async () => {
    let aiCalled = false;
    const service = new AccommodationsFieldSuggestionService({
      suggestAccommodationsField: async () => {
        aiCalled = true;
        return {
          suggestion: "$$$$",
          confidence: 0.9,
          reason: "AI fallback",
          sources: [],
        };
      },
    } as unknown as AltTextApiClient);

    const response = await service.suggestField({
      fieldKey: "price",
      formValues: { name: "Hotel", address: "123 Main St" },
      apiContext: {
        googleUrl: "https://maps.google.com/?cid=1",
        accommodationsHints: {
          source: "foursquare",
          foursquareId: "abc",
          price: "$$",
        },
      },
    });

    expect(aiCalled).toBe(false);
    expect(response.suggestion).toBe("$$");
    expect(response.source).toBe("existing-data");
  });

  test("returns no suggestion when AI confidence is low", async () => {
    const service = new AccommodationsFieldSuggestionService({
      suggestAccommodationsField: async () => ({
        suggestion: "yes",
        confidence: 0.4,
        reason: "Weak evidence",
        sources: [],
      }),
    } as unknown as AltTextApiClient);

    const response = await service.suggestField({
      fieldKey: "restaurant",
      formValues: { name: "Hotel", address: "123 Main St" },
    });

    expect(response.suggestion).toBeNull();
    expect(response.error).toContain("confidence");
  });
});
