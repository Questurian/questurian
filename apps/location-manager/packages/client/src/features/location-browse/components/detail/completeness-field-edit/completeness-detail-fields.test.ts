import type { LocationResponse } from "@client/shared/services/api/types";
import {
  buildDetailFieldUpdatePayload,
  getDetailFieldConfig,
  isDetailFieldKey,
  isDetailMultiFieldKey,
} from "./completeness-detail-fields";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
};

const accommodationsLocation = {
  id: "loc-1",
  category: "accommodations",
  accommodationsDetails: {
    core: { name: "The Meridian", price: "$$$" },
    the_stay: { kid_friendly: true, perfect_for: ["Couples"] },
    the_experience: { vibe: ["Luxury"] },
  },
} as unknown as LocationResponse;

describe("completeness detail field helpers", () => {
  test("classifies granular detail keys", () => {
    expect(isDetailFieldKey("accommodations.kidFriendly")).toBe(true);
    expect(isDetailFieldKey("attractions.bookingRequired")).toBe(true);
    expect(isDetailFieldKey("keyLocations.status")).toBe(true);
    expect(isDetailFieldKey("nightlife.vibe")).toBe(false);
    expect(isDetailMultiFieldKey("accommodations.parking")).toBe(true);
    expect(isDetailMultiFieldKey("accommodations.kidFriendly")).toBe(false);
  });

  test("reads the current draft value for a boolean field", () => {
    const config = getDetailFieldConfig("accommodations.kidFriendly");
    expect(config?.read(accommodationsLocation)).toBe("yes");
  });

  test("encodes a boolean field without dropping unrelated details", () => {
    const config = getDetailFieldConfig("accommodations.kidFriendly");
    if (!config) throw new Error("missing config");
    const payload = buildDetailFieldUpdatePayload(config, accommodationsLocation, "no");
    const details = payload.accommodationsDetails as Record<string, Record<string, unknown>>;

    expect(details.the_stay.kid_friendly).toBe(false);
    expect(details.the_stay.perfect_for).toEqual(["Couples"]);
    expect(details.core.name).toBe("The Meridian");
    expect(details.the_experience.vibe).toEqual(["Luxury"]);
  });

  test("mirrors price into the top-level priceLevel column", () => {
    const config = getDetailFieldConfig("accommodations.price");
    if (!config) throw new Error("missing config");
    const payload = buildDetailFieldUpdatePayload(config, accommodationsLocation, "$$$$");

    expect((payload.accommodationsDetails as Record<string, Record<string, unknown>>).core.price).toBe("$$$$");
    expect(payload.priceLevel).toBe("$$$$");
  });

  test("merges a multi field into the correct details section", () => {
    const config = getDetailFieldConfig("accommodations.parking");
    if (!config) throw new Error("missing config");
    const payload = buildDetailFieldUpdatePayload(config, accommodationsLocation, ["valet", "garage"]);
    const details = payload.accommodationsDetails as Record<string, Record<string, unknown>>;

    expect(details.the_stay.parking).toEqual(["valet", "garage"]);
    expect(details.the_stay.kid_friendly).toBe(true);
  });
});
