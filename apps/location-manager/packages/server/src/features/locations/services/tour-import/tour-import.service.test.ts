import { describe, expect, test } from "bun:test";
import { detectTourSourceProvider, normalizeTourImportUrl } from "./provider-detection";
import { formatTourDisplayPrice } from "./price-format";

describe("tour import provider detection", () => {
  test("detects Viator URLs", () => {
    expect(detectTourSourceProvider("https://www.viator.com/tours/London/x/d737-332498P586")).toBe("viator");
    expect(detectTourSourceProvider("https://viator.com/tours/London/x/d737-332498P586")).toBe("viator");
  });

  test("rejects unsupported providers", () => {
    expect(detectTourSourceProvider("https://example.com/tours/1")).toBeNull();
  });

  test("normalizes source URLs for duplicate detection", () => {
    expect(normalizeTourImportUrl("https://www.viator.com/tours/x/?b=2&a=1#reviews")).toBe(
      "https://www.viator.com/tours/x?a=1&b=2"
    );
  });
});

describe("tour import price formatting", () => {
  test("formats known currencies as display text", () => {
    expect(formatTourDisplayPrice(45, "USD")).toBe("From $45");
    expect(formatTourDisplayPrice(80.7, "EUR")).toBe("From €80.70");
  });

  test("falls back to currency code", () => {
    expect(formatTourDisplayPrice(80.7, "COP")).toBe("From 80.70 COP");
  });

  test("returns blank for missing price", () => {
    expect(formatTourDisplayPrice(null, "USD")).toBe("");
  });
});
