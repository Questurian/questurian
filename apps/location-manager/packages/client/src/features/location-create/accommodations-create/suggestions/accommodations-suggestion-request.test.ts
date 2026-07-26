import { describe, expect, test } from "bun:test";
import type { GooglePrefillResponse } from "@client/shared/services/api/types";
import { ACCOMMODATIONS_FORM_DEFAULT_VALUES } from "../accommodations-create.types";
import {
  buildAccommodationsSuggestionError,
  buildAccommodationsSuggestionRequest,
  canRequestAccommodationsSuggestion,
} from "./accommodations-suggestion-request";

const googleContext: GooglePrefillResponse = {
  googleUrl: "https://google.example/context",
  placeId: "context-place",
  lat: 40,
  lng: -73,
  locationKey: "us|new-york|soho",
  district: "SoHo",
  ianaTimeId: "America/New_York",
  phoneNumber: "+1 212 555 0100",
  website: "https://hotel.example",
  priceLevel: "$$$",
  operationHours: null,
  accommodationsHints: {
    source: "foursquare",
    price: "$$$",
  },
  type: null,
  tripadvisorUrl: null,
  tripadvisorPlaceData: null,
  menuUrl: null,
  bookingUrl: null,
  provenance: {},
};

describe("buildAccommodationsSuggestionRequest", () => {
  test("uses API context ahead of stale form context", () => {
    const request = buildAccommodationsSuggestionRequest({
      fieldKey: "bookingUrl",
      formValues: {
        ...ACCOMMODATIONS_FORM_DEFAULT_VALUES,
        googleUrl: "https://google.example/form",
        placeId: "form-place",
        phone: "+1 212 555 0199",
      },
      context: googleContext,
      locationTypes: [],
    });

    expect(request.category).toBe("accommodations");
    expect(request.apiContext?.googleUrl).toBe(
      "https://google.example/context"
    );
    expect(request.apiContext?.placeId).toBe("context-place");
    expect(request.apiContext?.phoneNumber).toBe("+1 212 555 0100");
    expect(request.apiContext?.priceLevel).toBe("$$$");
    expect(request.apiContext?.accommodationsHints).toEqual(
      googleContext.accommodationsHints
    );
    expect(request.allowedOptions).toEqual([]);
  });

  test("falls back to current form context when API context is absent", () => {
    const request = buildAccommodationsSuggestionRequest({
      fieldKey: "type",
      formValues: {
        ...ACCOMMODATIONS_FORM_DEFAULT_VALUES,
        googleUrl: "https://google.example/form",
        placeId: "form-place",
        locationKey: "us|chicago|loop",
        phone: "+1 312 555 0100",
      },
      context: null,
      locationTypes: [{ value: "hotel", label: "Hotel" }],
    });

    expect(request.apiContext?.googleUrl).toBe("https://google.example/form");
    expect(request.apiContext?.placeId).toBe("form-place");
    expect(request.apiContext?.locationKey).toBe("us|chicago|loop");
    expect(request.apiContext?.phoneNumber).toBe("+1 312 555 0100");
    expect(request.allowedOptions).toEqual([
      {
        value: "hotel",
        label: "Hotel",
        description: "Accommodation type from the configured taxonomy.",
      },
    ]);
  });
});

describe("accommodations suggestion request eligibility", () => {
  test("allows URL suggestions without a fixed option list", () => {
    expect(canRequestAccommodationsSuggestion("bookingUrl", [])).toBe(true);
  });

  test("requires configured options for taxonomy-backed type suggestions", () => {
    expect(canRequestAccommodationsSuggestion("type", [])).toBe(false);
    expect(
      canRequestAccommodationsSuggestion("type", [
        { value: "hotel", label: "Hotel" },
      ])
    ).toBe(true);
  });
});

describe("buildAccommodationsSuggestionError", () => {
  test("normalizes thrown and non-Error failures for operator review", () => {
    const thrownError = buildAccommodationsSuggestionError(
      "bookingUrl",
      new Error("request failed")
    );
    expect(thrownError.fieldKey).toBe("bookingUrl");
    expect(thrownError.kind).toBe("url");
    expect(thrownError.error).toBe("request failed");
    expect(
      buildAccommodationsSuggestionError("type", "request failed").error
    ).toBe("Unknown error");
  });
});
