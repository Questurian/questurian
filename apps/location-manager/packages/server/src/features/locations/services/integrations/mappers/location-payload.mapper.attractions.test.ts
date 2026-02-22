import { describe, expect, test } from "bun:test";
import type { LocationResponse } from "../../../models/location";
import { mapLocationToPayloadFormat } from "./location-payload.mapper";

describe("mapLocationToPayloadFormat attractions", () => {
  test("maps structured attractions details and operation hours for payload", () => {
    const location = {
      id: 1,
      title: "Attraction Test",
      category: "attractions",
      type: "museum",
      locationKey: "peru|lima|miraflores",
      ianaTimeId: "America/Lima",
      payload_location_ref: "789",
      idealFor: ["Families", "History Buffs"],
      nightlifeDetails: null,
      accommodationsDetails: null,
      attractionsDetails: {
        core: {
          attraction_type: "museum",
          pricing: "$$",
        },
      visit: {
        booking_required: true,
        ideal_for: ["Families", "History Buffs"],
      },
      },
      keyLocationsDetails: null,
      operationHours: { monday: "09:00:00 - 22:00:00", currently_open: true },
      tripadvisorMealTypes: null,
      tripadvisorCuisines: null,
      tripadvisorFeatures: null,
      priceLevel: "$$",
      contact: {
        countryCode: "PE",
        phoneNumber: "+51 999 999 999",
        website: "https://attractions.example.com",
        email: "hello@attractions.example.com",
        contactAddress: "Secondary contact address",
        url: "https://maps.google.com/?q=attractions",
      },
      coordinates: { lat: -12.12, lng: -77.03 },
      source: { name: "Attraction Source", address: "Source Address 123" },
      instagram_embeds: [],
      uploads: [],
      slug: null,
      reviewsFetchedAt: null,
      reviewsCount: null,
      reviewsGoogleCount: null,
      reviewsTripadvisorCount: null,
      reviewsEnabled: false,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    } as unknown as LocationResponse;

    const payload = mapLocationToPayloadFormat(
      location,
      { galleryImageIds: [], instagramPostIds: [] },
      "789"
    );

    expect(payload.location).toBe("peru|lima|miraflores");
    expect(payload.operationHours).toEqual({
      hours: [{ day: "Monday", hours: "09:00:00 - 22:00:00" }],
    });
    expect(payload.attractionsDetails).toEqual({
      core: {
        attractionType: "museum",
        pricing: "$$",
      },
      visit: {
        bookingRequired: true,
        idealFor: ["Families", "History Buffs"],
      },
    });
  });
});
