import { describe, expect, test } from "bun:test";
import { isOptionSuggestionEligible } from "./option-suggestion-eligibility";

describe("isOptionSuggestionEligible", () => {
  test("allows untouched default option values after prefill", () => {
    expect(
      isOptionSuggestionEligible({
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
      isOptionSuggestionEligible({
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
      isOptionSuggestionEligible({
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

  test("URL-kind fields skip the options check but obey the rest of the rule", () => {
    expect(
      isOptionSuggestionEligible({
        value: "",
        defaultValue: "",
        isPrefillReady: true,
        optionsCount: 0,
        isDirty: false,
        isApiFilled: false,
        isAiSuggested: false,
        isUrlKind: true,
      })
    ).toBe(true);
    expect(
      isOptionSuggestionEligible({
        value: "",
        defaultValue: "",
        isPrefillReady: false,
        optionsCount: 0,
        isDirty: false,
        isApiFilled: false,
        isAiSuggested: false,
        isUrlKind: true,
      })
    ).toBe(false);
  });
});
