import { describe, expect, test } from "bun:test";
import { isAccommodationOptionSuggestionEligible } from "./accommodations-ai-suggestions";

describe("isAccommodationOptionSuggestionEligible", () => {
  test("allows untouched default option values after prefill", () => {
    expect(
      isAccommodationOptionSuggestionEligible({
        value: "$$$",
        defaultValue: "$$$",
        isPrefillReady: true,
        optionsCount: 4,
        isDirty: false,
        isApiFilled: false,
        isAiSuggested: false,
      })
    ).toBe(true);
  });

  test("blocks manually changed fields", () => {
    expect(
      isAccommodationOptionSuggestionEligible({
        value: "$$",
        defaultValue: "$$$",
        isPrefillReady: true,
        optionsCount: 4,
        isDirty: true,
        isApiFilled: false,
        isAiSuggested: false,
      })
    ).toBe(false);
  });

  test("blocks API-filled fields", () => {
    expect(
      isAccommodationOptionSuggestionEligible({
        value: "$$",
        defaultValue: "$$$",
        isPrefillReady: true,
        optionsCount: 4,
        isDirty: true,
        isApiFilled: true,
        isAiSuggested: false,
      })
    ).toBe(false);
  });
});
