import { describe, expect, test } from "bun:test";
import { createMapsSchema, googlePrefillSchema, patchMapsSchema } from "./maps.schemas";

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

  test("accepts optional shared entities fields for nightlife payload", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "nightlife",
      type: "nightclub",
      title: "Manual Nightlife Title",
      url: "https://www.google.com/maps/search/?api=1&query=test",
      lat: -12.0464,
      lng: -77.0428,
      locationKey: "peru|lima|miraflores",
      district: "miraflores",
      contactAddress: "Manual Contact Address",
      countryCode: "pe",
      ianaTimeId: "America/Lima",
      placeId: "manual-place-id",
      phoneNumber: "+51 999 111 222",
      website: "https://example.com/nightlife",
      nightlifeDetails: {
        vibe: "high-energy",
        dressCode: "smart-casual",
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.countryCode).toBe("PE");
    expect(result.data.lat).toBe(-12.0464);
    expect(result.data.lng).toBe(-77.0428);
    expect(result.data.locationKey).toBe("peru|lima|miraflores");
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

describe("google prefill schema", () => {
  test("accepts valid name and address", () => {
    const result = googlePrefillSchema.safeParse({
      name: "Nebula",
      address: "Av. La Mar 1337, Miraflores, Lima",
    });

    expect(result.success).toBe(true);
  });

  test("rejects missing address", () => {
    const result = googlePrefillSchema.safeParse({
      name: "Nebula",
      address: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("maps patch schema reviews toggle", () => {
  test("accepts reviewsEnabled as the only patch field", () => {
    const result = patchMapsSchema.safeParse({
      reviewsEnabled: false,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.reviewsEnabled).toBe(false);
  });
});
