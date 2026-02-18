import { describe, expect, test } from "bun:test";
import { createMapsSchema } from "./maps.schemas";

const basePayload = {
  name: "Test Location",
  address: "123 Test St, Test City",
  type: "restaurant",
};

describe("maps create schema category rules", () => {
  test("accepts dining payload when idealFor is provided", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "dining",
      idealFor: ["Date Nights"],
    });

    expect(result.success).toBe(true);
  });

  test("rejects dining payload when idealFor is missing", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "dining",
    });

    expect(result.success).toBe(false);
  });

  test("accepts nightlife payload with nightlifeDetails and no idealFor", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "nightlife",
      type: "nightclub",
      nightlifeDetails: {
        vibe: "high-energy",
        dressCode: "smart-casual",
      },
    });

    expect(result.success).toBe(true);
  });

  test("rejects nightlife payload when nightlifeDetails is missing", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "nightlife",
      type: "nightclub",
    });

    expect(result.success).toBe(false);
  });
});
