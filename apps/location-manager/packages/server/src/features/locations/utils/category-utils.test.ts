import { describe, expect, test } from "bun:test";
import {
  mergeCategoryLists,
  normalizeCategoryList,
  parseCategoryListJson,
  toCategoryListJson,
} from "./category-utils";

describe("category-utils", () => {
  test("normalizes and deduplicates category arrays", () => {
    const categories = normalizeCategoryList(["dining", "nightlife", "dining"], "attractions");
    expect(categories).toEqual(["dining", "nightlife"]);
  });

  test("falls back to default category when input is invalid", () => {
    expect(normalizeCategoryList(["invalid"], "nightlife")).toEqual(["nightlife"]);
  });

  test("parses categories_json and falls back safely when malformed", () => {
    expect(parseCategoryListJson('["dining","nightlife"]', "attractions")).toEqual([
      "dining",
      "nightlife",
    ]);
    expect(parseCategoryListJson("not-json", "accommodations")).toEqual(["accommodations"]);
  });

  test("serializes normalized category arrays", () => {
    expect(toCategoryListJson(["nightlife", "dining", "nightlife"], "attractions")).toBe(
      '["nightlife","dining"]'
    );
  });

  test("merges category lists while preserving order", () => {
    expect(
      mergeCategoryLists(
        ["dining", "nightlife"],
        ["nightlife", "accommodations"],
        ["attractions"]
      )
    ).toEqual(["dining", "nightlife", "accommodations", "attractions"]);
  });
});
