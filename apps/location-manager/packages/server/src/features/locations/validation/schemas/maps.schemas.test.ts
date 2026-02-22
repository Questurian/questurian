import { describe, expect, test } from "bun:test";
import { createMapsSchema, googlePrefillSchema, patchMapsSchema } from "./maps.schemas";

const basePayload = {
  name: "Test Location",
  address: "123 Test St, Test City",
  type: "restaurant",
};

describe("maps create schema category rules", () => {
  test("accepts dining payload when dining idealFor tags are provided", () => {
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

  test("rejects dining payload with non-dining idealFor tags", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "dining",
      idealFor: ["Families"],
    });

    expect(result.success).toBe(false);
  });

  test("rejects nightlife payload when idealFor is missing", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "nightlife",
      type: "nightclub",
      nightlifeDetails: {
        vibe: "high-energy",
        dressCode: "smart-casual",
      },
    });

    expect(result.success).toBe(false);
  });

  test("accepts nightlife payload with nightlifeDetails and nightlife idealFor", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "nightlife",
      type: "nightclub",
      idealFor: ["Friends' Night Out"],
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

  test("rejects nightlife payload with non-nightlife idealFor tags", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "nightlife",
      nightlifeDetails: {
        vibe: "high-energy",
      },
      idealFor: ["Families"],
    });

    expect(result.success).toBe(false);
  });

  test("accepts accommodations payload with accommodationsDetails and no idealFor", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "accommodations",
      type: "hotel",
      priceLevel: "$$$$",
      accommodationsDetails: {
        core: {
          name: "The Meridian Grand",
          price: "$$$$",
          district: "Financial District",
          type: "Hotel",
        },
      },
    });

    expect(result.success).toBe(true);
  });

  test("rejects accommodations payload when accommodationsDetails is missing", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "accommodations",
      type: "hotel",
    });

    expect(result.success).toBe(false);
  });

  test("accepts attractions payload with attractionsDetails and attractions idealFor", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "attractions",
      type: "museum",
      idealFor: ["Families", "History Buffs"],
      attractionsDetails: {
        core: {
          attraction_type: "museum",
        },
        visit: {
          booking_required: false,
          ideal_for: ["Families", "History Buffs"],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  test("rejects attractions payload when idealFor is missing", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "attractions",
      attractionsDetails: {
        core: { attraction_type: "museum" },
      },
    });

    expect(result.success).toBe(false);
  });

  test("rejects attractions payload when attractionsDetails is missing", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "attractions",
      idealFor: ["Families"],
    });

    expect(result.success).toBe(false);
  });

  test("rejects attractions payload with non-attractions idealFor tags", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "attractions",
      idealFor: ["Date Nights"],
      attractionsDetails: {
        core: { attraction_type: "museum" },
      },
    });

    expect(result.success).toBe(false);
  });

  test("accepts key_locations payload with keyLocationsDetails", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "key_locations",
      type: "airport",
      keyLocationsDetails: {
        location_type: "airport",
        status: "active",
        details: {
          access: {
            taxi: { available: true },
          },
          info: {
            terminals: 2,
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  test("rejects key_locations payload when keyLocationsDetails is missing", () => {
    const result = createMapsSchema.safeParse({
      ...basePayload,
      category: "key_locations",
      type: "airport",
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

  test("accepts attractionsDetails as a patch field", () => {
    const result = patchMapsSchema.safeParse({
      attractionsDetails: {
        visit: {
          booking_required: true,
        },
      },
    });

    expect(result.success).toBe(true);
  });
});
