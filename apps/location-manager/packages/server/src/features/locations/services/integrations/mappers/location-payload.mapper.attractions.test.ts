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
      nightlifeDetails: null,
      accommodationsDetails: null,
      attractionsDetails: {
        core: {
          attraction_type: "museum",
          pricing: "$$",
        },
      visit: {
        booking_required: true,
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
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    } as unknown as LocationResponse;

    const payload = mapLocationToPayloadFormat(
      location,
      { galleryImageIds: [], instagramPostIds: [], galleryUploadFailures: 0 },
      "789",
      { tourPayloadIds: ["101", "tour-abc"] }
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
        bookingUrl: null,
      },
    });
    expect(payload.tours).toEqual([101, "tour-abc"]);
    expect(payload).not.toHaveProperty("idealFor");
  });

  test("sends explicit clears for blank optional website, phone, and pricing fields", () => {
    const location = {
      id: 2,
      title: "Attraction Test No Website",
      category: "attractions",
      type: "museum",
      locationKey: "peru|lima|miraflores",
      ianaTimeId: "America/Lima",
      payload_location_ref: "790",
      nightlifeDetails: null,
      accommodationsDetails: null,
      attractionsDetails: {
        core: {
          attraction_type: "museum",
        },
        visit: {
          booking_required: true,
        },
      },
      keyLocationsDetails: null,
      operationHours: { monday: "09:00:00 - 22:00:00", currently_open: true },
      tripadvisorMealTypes: null,
      tripadvisorCuisines: null,
      tripadvisorFeatures: null,
      priceLevel: null,
      contact: {
        countryCode: "PE",
        phoneNumber: null,
        website: "",
        email: "hello@attractions.example.com",
        contactAddress: "Secondary contact address",
        url: "https://maps.google.com/?q=attractions",
      },
      coordinates: { lat: -12.12, lng: -77.03 },
      source: { name: "Attraction Source", address: "Source Address 123" },
      instagram_embeds: [],
      uploads: [],
      slug: null,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    } as unknown as LocationResponse;

    const payload = mapLocationToPayloadFormat(
      location,
      { galleryImageIds: [], instagramPostIds: [], galleryUploadFailures: 0 },
      "790"
    );

    expect(payload).toHaveProperty("website", null);
    expect(payload).toHaveProperty("phoneNumber", null);
    expect(payload).toHaveProperty("priceLevel", null);
    expect(payload.attractionsDetails).toEqual({
      core: { attractionType: "museum", pricing: null },
      visit: { bookingRequired: true, bookingUrl: null },
    });
  });

  test("appends selected Payload media sets after uploads and removes duplicates", () => {
    const location = {
      id: 3,
      title: "Attraction With Selected Payload Media",
      category: "attractions",
      type: "museum",
      locationKey: "peru|lima|miraflores",
      ianaTimeId: "America/Lima",
      payload_location_ref: "791",
      selectedPayloadMediaSetIds: ["media-set-2", "media-set-3", "media-set-1"],
      nightlifeDetails: null,
      accommodationsDetails: null,
      attractionsDetails: {
        core: {
          attraction_type: "museum",
        },
      },
      keyLocationsDetails: null,
      operationHours: null,
      tripadvisorMealTypes: null,
      tripadvisorCuisines: null,
      tripadvisorFeatures: null,
      priceLevel: "$$",
      contact: {
        countryCode: "PE",
        phoneNumber: "+51 999 999 999",
        website: "https://attractions.example.com",
        email: null,
        contactAddress: null,
        url: "https://maps.google.com/?q=attractions",
      },
      coordinates: { lat: -12.12, lng: -77.03 },
      source: { name: "Attraction Source", address: "Source Address 123" },
      instagram_embeds: [],
      uploads: [],
      slug: null,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    } as unknown as LocationResponse;

    const payload = mapLocationToPayloadFormat(
      location,
      {
        galleryImageIds: ["media-set-1", "media-set-2"],
        instagramPostIds: [],
        galleryUploadFailures: 0,
      },
      "791"
    );

    expect(payload.gallery.map((item) => item.image)).toEqual([
      "media-set-1",
      "media-set-2",
      "media-set-3",
    ]);
  });

  test("coerces numeric-looking media-set ids to numbers for Payload relationships", () => {
    const location = {
      id: 5,
      title: "Attraction With Existing Payload Media",
      category: "attractions",
      type: "museum",
      locationKey: "peru|lima|miraflores",
      ianaTimeId: "America/Lima",
      payload_location_ref: "793",
      selectedPayloadMediaSetIds: ["42", "84"],
      nightlifeDetails: null,
      accommodationsDetails: null,
      attractionsDetails: {
        core: {
          attraction_type: "museum",
        },
      },
      keyLocationsDetails: null,
      operationHours: null,
      tripadvisorMealTypes: null,
      tripadvisorCuisines: null,
      tripadvisorFeatures: null,
      priceLevel: "$$",
      contact: {
        countryCode: "PE",
        phoneNumber: "+51 999 999 999",
        website: "https://attractions.example.com",
        email: null,
        contactAddress: null,
        url: "https://maps.google.com/?q=attractions",
      },
      coordinates: { lat: -12.12, lng: -77.03 },
      source: { name: "Attraction Source", address: "Source Address 123" },
      instagram_embeds: [],
      uploads: [],
      slug: null,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    } as unknown as LocationResponse;

    const payload = mapLocationToPayloadFormat(
      location,
      {
        galleryImageIds: ["11"],
        instagramPostIds: [],
        galleryUploadFailures: 0,
      },
      "793"
    );

    expect(payload.gallery.map((item) => item.image)).toEqual([11, 42, 84]);
  });

  test("throws when uploads plus selected Payload media exceed attraction gallery limit", () => {
    const location = {
      id: 4,
      title: "Overflow Attraction Gallery",
      category: "attractions",
      type: "museum",
      locationKey: "peru|lima|miraflores",
      ianaTimeId: "America/Lima",
      payload_location_ref: "792",
      selectedPayloadMediaSetIds: Array.from(
        { length: 10 },
        (_, index) => `selected-media-${index + 1}`
      ),
      nightlifeDetails: null,
      accommodationsDetails: null,
      attractionsDetails: {
        core: {
          attraction_type: "museum",
        },
      },
      keyLocationsDetails: null,
      operationHours: null,
      tripadvisorMealTypes: null,
      tripadvisorCuisines: null,
      tripadvisorFeatures: null,
      priceLevel: "$$",
      contact: {
        countryCode: "PE",
        phoneNumber: "+51 999 999 999",
        website: "https://attractions.example.com",
        email: null,
        contactAddress: null,
        url: "https://maps.google.com/?q=attractions",
      },
      coordinates: { lat: -12.12, lng: -77.03 },
      source: { name: "Attraction Source", address: "Source Address 123" },
      instagram_embeds: [],
      uploads: [],
      slug: null,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    } as unknown as LocationResponse;

    expect(() =>
      mapLocationToPayloadFormat(
        location,
        {
          galleryImageIds: Array.from(
            { length: 11 },
            (_, index) => `uploaded-media-${index + 1}`
          ),
          instagramPostIds: [],
          galleryUploadFailures: 0,
        },
        "792"
      )
    ).toThrow("Attractions gallery exceeds Payload max of 20 items");
  });
});
