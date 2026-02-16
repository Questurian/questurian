import { describe, expect, test } from "bun:test";
import {
  createMergedReviewsFilename,
  createRejectsReportFilename,
  extractTimestampFromFilename,
} from "./translate-merge-reviews.repository";

describe("translate merge repository helpers", () => {
  test("builds merged and rejects filenames", () => {
    expect(createMergedReviewsFilename(12, 1700000000000)).toBe(
      "merged_reviews_12_1700000000000.json"
    );
    expect(createRejectsReportFilename(12, 1700000000000)).toBe(
      "rejects_report_12_1700000000000.json"
    );
  });

  test("extracts timestamp from review artifact filenames", () => {
    expect(extractTimestampFromFilename("merged_reviews_12_1700000000000.json")).toBe(
      "1700000000000"
    );
    expect(extractTimestampFromFilename("rejects_report_12_1700000000001.json")).toBe(
      "1700000000001"
    );
    expect(extractTimestampFromFilename("invalid-name.json")).toBeNull();
  });
});
