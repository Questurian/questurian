import { describe, expect, test } from "bun:test";
import { ACCOMMODATIONS_FORM_DEFAULT_VALUES } from "../accommodations-create.types";
import {
  canSuggestAccommodationsField,
  getEligibleAutoSuggestionFields,
} from "./accommodations-suggestion-eligibility";

describe("canSuggestAccommodationsField", () => {
  const baseInput = {
    fieldKey: "bookingUrl" as const,
    value: "",
    locationTypes: [],
    isPrefillReady: true,
    isDirty: false,
    isApiFilled: false,
    isAiSuggested: false,
    isPending: false,
    isQueued: false,
  };

  test("allows an untouched URL field after prefill", () => {
    expect(canSuggestAccommodationsField(baseInput)).toBe(true);
  });

  test("blocks fields that already have an in-flight or queued result", () => {
    expect(
      canSuggestAccommodationsField({ ...baseInput, isPending: true })
    ).toBe(false);
    expect(
      canSuggestAccommodationsField({ ...baseInput, isQueued: true })
    ).toBe(false);
  });
});

describe("getEligibleAutoSuggestionFields", () => {
  test("keeps empty fields while excluding API-owned and operator-filled fields", () => {
    const eligible = getEligibleAutoSuggestionFields({
      formValues: {
        ...ACCOMMODATIONS_FORM_DEFAULT_VALUES,
        type: "hotel",
      },
      apiFilledFields: new Set(["wifi"]),
      locationTypes: [{ value: "hotel", label: "Hotel" }],
    });

    expect(eligible.includes("bookingUrl")).toBe(true);
    expect(eligible.includes("type")).toBe(false);
    expect(eligible.includes("wifi")).toBe(false);
    expect(eligible.includes("kidFriendly")).toBe(true);
  });
});
