import { describe, expect, test } from "bun:test";
import {
  filterTripadvisorFeatures,
  normalizeTripadvisorStringList,
  parseTripadvisorStringListJson,
} from "./tripadvisor-utils";

describe("TripAdvisor list normalization", () => {
  test("normalizes mixed array values and deduplicates entries", () => {
    const value = [
      "Dinner",
      " Dinner ",
      { text: "Outdoor Seating" },
      { name: "Live Music" },
      { text: "  " },
      123,
      null,
    ];

    expect(normalizeTripadvisorStringList(value)).toEqual([
      "Dinner",
      "Outdoor Seating",
      "Live Music",
    ]);
  });

  test("returns null for unsupported or empty inputs", () => {
    expect(normalizeTripadvisorStringList("not-an-array")).toBeNull();
    expect(normalizeTripadvisorStringList([])).toBeNull();
  });

  test("parses stored JSON string arrays", () => {
    expect(parseTripadvisorStringListJson('["Brunch", "Seafood"]')).toEqual([
      "Brunch",
      "Seafood",
    ]);
    expect(parseTripadvisorStringListJson("not-json")).toBeNull();
  });

  test("filters excluded TripAdvisor features", () => {
    expect(
      filterTripadvisorFeatures([
        "Delivery",
        "Takeout",
        "Seating",
        "Wheelchair Accessible",
        "Full Bar",
        "Table Service",
        "Live Music",
        "Serves Alcohol",
        "Free Wifi",
        "Drive Thru",
        "Dog Friendly",
        "American Express",
        "Mastercard",
        "Visa",
        "Accepts Credit Cards",
        "Reservations",
      ])
    ).toEqual([
      "AmEx accepted",
      "Mastercard accepted",
      "Visa accepted",
      "Reservations",
    ]);
  });
});
