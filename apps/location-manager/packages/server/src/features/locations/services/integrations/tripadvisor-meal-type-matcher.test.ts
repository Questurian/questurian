import { describe, expect, test } from "bun:test";
import { matchTripAdvisorMealTypesToDiningFields } from "./tripadvisor-meal-type-matcher";

describe("matchTripAdvisorMealTypesToDiningFields", () => {
  test("adds exact meal-type matches to cuisines and ideal-for without setting type when none match", () => {
    const result = matchTripAdvisorMealTypesToDiningFields({
      category: "dining",
      mealTypes: ["Breakfast", "Lunch", "Brunch", "Dinner"],
      currentType: null,
      currentCuisines: [],
      currentIdealFor: [],
    });

    expect(result.nextType).toBeUndefined();
    expect(result.nextCuisines).toEqual(["Brunch"]);
    expect(result.nextIdealFor).toEqual(["Breakfast", "Lunch", "Brunch"]);
  });

  test("matches case-insensitively after trimming", () => {
    const result = matchTripAdvisorMealTypesToDiningFields({
      category: "dining",
      mealTypes: [" lunch "],
      currentType: null,
      currentCuisines: [],
      currentIdealFor: [],
    });

    expect(result.nextIdealFor).toEqual(["Lunch"]);
  });

  test("allows overlap across target fields", () => {
    const result = matchTripAdvisorMealTypesToDiningFields({
      category: "dining",
      mealTypes: ["Brunch"],
      currentType: null,
      currentCuisines: [],
      currentIdealFor: [],
    });

    expect(result.nextCuisines).toEqual(["Brunch"]);
    expect(result.nextIdealFor).toEqual(["Brunch"]);
  });

  test("does not apply non-exact matches", () => {
    const result = matchTripAdvisorMealTypesToDiningFields({
      category: "dining",
      mealTypes: ["Late Night"],
      currentType: null,
      currentCuisines: [],
      currentIdealFor: [],
    });

    expect(result).toEqual({});
  });

  test("does not duplicate existing values", () => {
    const result = matchTripAdvisorMealTypesToDiningFields({
      category: "dining",
      mealTypes: ["Brunch", "Lunch"],
      currentType: null,
      currentCuisines: ["Brunch"],
      currentIdealFor: ["Lunch"],
    });

    expect(result.nextCuisines).toBeUndefined();
    expect(result.nextIdealFor).toEqual(["Lunch", "Brunch"]);
  });

  test("does not append ideal-for when already at max of four", () => {
    const result = matchTripAdvisorMealTypesToDiningFields({
      category: "dining",
      mealTypes: ["Breakfast", "Brunch"],
      currentType: null,
      currentCuisines: [],
      currentIdealFor: ["Date Nights", "Special Occasions", "Family-Friendly", "Business Dining"],
    });

    expect(result.nextIdealFor).toBeUndefined();
    expect(result.nextCuisines).toEqual(["Brunch"]);
  });
});
