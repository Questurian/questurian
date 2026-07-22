import { describe, expect, test } from "bun:test";
import type { LocationResponse } from "@client/shared/services/api/types";
import { createCompletenessFieldContext } from "./common";
import {
  getImportantOptionalCompletenessFields,
  getLocationCompletenessFields,
} from "./index";

function minimalLocation(category: LocationResponse["category"]): LocationResponse {
  return {
    category,
    source: {},
    contact: {},
    coordinates: { lat: null, lng: null },
    uploads: [],
    instagram_embeds: [],
  } as unknown as LocationResponse;
}

describe("location completeness fields", () => {
  test("does not require phone for any location category", () => {
    for (const category of ["dining", "nightlife", "accommodations", "attractions", "key_locations"] as const) {
      const fields = getLocationCompletenessFields(minimalLocation(category));
      expect(fields.some((field) => field.key === "phone")).toBe(false);
    }
  });

  test("does not require attraction pricing", () => {
    const fields = getLocationCompletenessFields(minimalLocation("attractions"));
    expect(fields.some((field) => field.key === "attractions.pricing")).toBe(false);
  });

  test("uses complete attraction required and optional field inventories", () => {
    const location = minimalLocation("attractions");
    const requiredKeys = getLocationCompletenessFields(location).map((field) => field.key);
    const optionalKeys = getImportantOptionalCompletenessFields(location).map((field) => field.key);

    expect(requiredKeys).toEqual([
      "name",
      "title",
      "sourceAddress",
      "category",
      "locationKey",
      "district",
      "countryCode",
      "ianaTimeId",
      "coordinates",
      "attractions.type",
      "attractions.bookingRequired",
      "operationHours",
      "media",
    ]);
    expect(optionalKeys).toEqual([
      "website",
      "phone",
      "attractions.pricing",
      "bookingUrl",
    ]);
  });

  test("does not count an empty canonical hours array as configured", () => {
    const context = createCompletenessFieldContext({
      ...minimalLocation("attractions"),
      operationHours: { hours: [] },
    });
    expect(context.hasOperationHours).toBe(false);
  });
});
