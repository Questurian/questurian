import { describe, expect, test } from "bun:test";
import type { LocationResponse } from "../../../models/location";
import { mapLocationToPayloadFormat } from "./location-payload.mapper";

describe("mapLocationToPayloadFormat key_locations", () => {
  test("maps structured key location details and excludes legacy/duplicate fields", () => {
    const location = {
      id: 1,
      title: "Airport Hub",
      category: "key_locations",
      type: "airport",
      locationKey: "peru|lima|miraflores",
      district: "Miraflores",
      ianaTimeId: "America/Lima",
      placeId: "google-place-id",
      tripadvisorUrl: "https://www.tripadvisor.com/test",
      payload_location_ref: "999",
      neighborhoodDescription: "Near central avenue",
      idealFor: null,
      nightlifeDetails: null,
      accommodationsDetails: null,
      attractionsDetails: null,
      keyLocationsDetails: {
        location_type: "airport",
        status: "active",
        neighborhood: "Callao",
        website: "https://keylocation.example.com",
        phone: "+51 111 111 111",
        hours: {
          hours: [{ day: "Monday", hours: "00:00:00 - 23:59:59" }],
        },
      },
      operationHours: { monday: "00:00:00 - 23:59:59", currently_open: true },
      tripadvisorMealTypes: null,
      tripadvisorCuisines: null,
      tripadvisorFeatures: null,
      priceLevel: null,
      contact: {
        countryCode: "PE",
        phoneNumber: "+51 999 999 999",
        website: "https://keylocation.example.com",
        email: "hello@keylocation.example.com",
        contactAddress: "Secondary contact address",
        url: "https://maps.google.com/?q=airport",
      },
      coordinates: { lat: -12.04, lng: -77.11 },
      source: { name: "LM Source", address: "Source Address 123" },
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
      "999"
    );

    expect(payload.location).toBe("peru|lima|miraflores");
    expect(payload.keyLocationStatus).toBe("active");
    expect(payload.operationHours).toEqual({
      hours: [{ day: "Monday", hours: "00:00:00 - 23:59:59" }],
    });
    expect(payload.keyLocationsDetails).toEqual({
      core: {
        locationType: "airport",
        status: "active",
        neighborhood: "Callao",
      },
    });

    expect(payload).not.toHaveProperty("neighborhoodDescription");
    expect(payload).not.toHaveProperty("tripadvisorUrl");
    expect(payload).not.toHaveProperty("tripadvisorLocationId");
    expect(payload).not.toHaveProperty("placeId");
    expect(payload).not.toHaveProperty("contactAddress");
    expect(payload).not.toHaveProperty("locationKey");
    expect(payload).not.toHaveProperty("district");
  });
});
