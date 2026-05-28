import { describe, expect, test } from "bun:test";
import type { LocationResponse } from "../../../models/location";
import { mapLocationToPayloadFormat } from "./location-payload.mapper";

describe("mapLocationToPayloadFormat dining", () => {
  test("only includes fields supported by Payload dining collection", () => {
    const location = {
      id: 1,
      title: "Dining Test",
      category: "dining",
      type: "restaurant",
      locationKey: "colombia|bogota|chapinero",
      district: "Chapinero",
      ianaTimeId: "America/Bogota",
      placeId: "google-place-id",
      tripadvisorUrl: "https://www.tripadvisor.com/Restaurant_Review-test",
      payload_location_ref: "123",
      neighborhoodDescription: "Near Parque de la 93",
      idealFor: ["date-night"],
      nightlifeDetails: null,
      accommodationsDetails: null,
      attractionsDetails: null,
      keyLocationsDetails: null,
      operationHours: { monday: "9-5", currently_open: true },
      tripadvisorMealTypes: ["Dinner"],
      tripadvisorCuisines: ["Colombian"],
      tripadvisorFeatures: ["Reservations"],
      menuUrl: "https://dining.example.com/menu",
      bookingUrl: "https://dining.example.com/reserve",
      priceLevel: "$$",
      contact: {
        countryCode: "CO",
        phoneNumber: "+57 300 123 4567",
        website: "https://dining.example.com",
        email: "hello@dining.example.com",
        contactAddress: "Secondary contact address",
        url: "https://maps.google.com/?q=dining",
      },
      coordinates: { lat: 4.68, lng: -74.05 },
      source: { name: "Dining Source", address: "Source Address 123" },
      instagram_embeds: [],
      uploads: [],
      slug: null,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    } as unknown as LocationResponse;

    const payload = mapLocationToPayloadFormat(
      location,
      { galleryImageIds: [], instagramPostIds: [] },
      "123"
    );

    expect(payload).toHaveProperty("cuisines");
    expect(payload).toHaveProperty("idealFor");
    expect(payload).toHaveProperty("menuUrl", "https://dining.example.com/menu");
    expect(payload).toHaveProperty("bookingUrl", "https://dining.example.com/reserve");
    expect(payload).toHaveProperty("operationHours");
    expect(payload.operationHours).toEqual({
      hours: [{ day: "Monday", hours: "9-5" }],
    });

    expect(payload).not.toHaveProperty("neighborhoodDescription");
    expect(payload).not.toHaveProperty("tripadvisorUrl");
    expect(payload).not.toHaveProperty("tripadvisorLocationId");
    expect(payload).not.toHaveProperty("placeId");
    expect(payload).not.toHaveProperty("contactAddress");
    expect(payload).not.toHaveProperty("locationKey");
    expect(payload).not.toHaveProperty("district");
    expect(payload).not.toHaveProperty("features");
    expect(payload).not.toHaveProperty("mealTypes");
    expect(payload).not.toHaveProperty("countryCodeIso");
    expect(payload).not.toHaveProperty("sourceName");
  });

  test("omits menu and reservation urls when not present", () => {
    const location = {
      id: 2,
      title: "Dining Test",
      category: "dining",
      type: "restaurant",
      payload_location_ref: "123",
      idealFor: ["date-night"],
      nightlifeDetails: null,
      accommodationsDetails: null,
      attractionsDetails: null,
      keyLocationsDetails: null,
      operationHours: null,
      tripadvisorMealTypes: null,
      tripadvisorCuisines: null,
      tripadvisorFeatures: null,
      menuUrl: null,
      bookingUrl: null,
      priceLevel: null,
      contact: {
        countryCode: null,
        phoneNumber: null,
        website: null,
        email: null,
        contactAddress: null,
        url: "",
      },
      coordinates: { lat: null, lng: null },
      source: { name: "Dining Source", address: "Source Address 123" },
      instagram_embeds: [],
      uploads: [],
      slug: null,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    } as unknown as LocationResponse;

    const payload = mapLocationToPayloadFormat(
      location,
      { galleryImageIds: [], instagramPostIds: [] },
      "123"
    );

    expect(payload).not.toHaveProperty("menuUrl");
    expect(payload).not.toHaveProperty("bookingUrl");
  });
});
