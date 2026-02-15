import { describe, expect, test } from "bun:test";
import { SerpApiTripAdvisorClient } from "./serpapi-tripadvisor.client";

describe("SerpApiTripAdvisorClient place filtering", () => {
  test("maps dining_options into features and normalizes meal aliases", () => {
    const client = new SerpApiTripAdvisorClient({ SERPAPI_KEY: "test-key" } as any);
    const filterPlaceResult = (client as unknown as { filterPlaceResult: (input: Record<string, unknown>) => Record<string, unknown> }).filterPlaceResult.bind(client);

    const result = filterPlaceResult({
      title: "Test Place",
      mealtypes: ["Dinner", " Lunch "],
      cuisines: ["Peruvian", "Peruvian", " Seafood "],
      dining_options: [
        "Takeout",
        " Delivery ",
        "Takeout",
        "Free Wifi",
        "Serves Alcohol",
        "American Express",
        "Mastercard",
        "Visa",
        "Accepts Credit Cards",
      ],
      features: null,
      diets: ["Vegetarian friendly"],
    });

    expect(result.title).toBe("Test Place");
    expect(result.meal_types).toEqual(["Dinner", "Lunch"]);
    expect(result.cuisines).toEqual(["Peruvian", "Seafood"]);
    expect(result.features).toEqual([
      "AmEx accepted",
      "Mastercard accepted",
      "Visa accepted",
    ]);
    expect("dining_options" in result).toBe(false);
    expect("diets" in result).toBe(false);
  });

  test("keeps explicit empty features when all incoming values are excluded", () => {
    const client = new SerpApiTripAdvisorClient({ SERPAPI_KEY: "test-key" } as any);
    const filterPlaceResult = (client as unknown as { filterPlaceResult: (input: Record<string, unknown>) => Record<string, unknown> }).filterPlaceResult.bind(client);

    const result = filterPlaceResult({
      dining_options: [
        "Free Wifi",
        "Serves Alcohol",
        "Dog Friendly",
        "Drive Thru",
      ],
    });

    expect(result.features).toEqual([]);
  });
});
