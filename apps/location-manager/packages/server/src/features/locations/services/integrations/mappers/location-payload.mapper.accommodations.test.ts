import { describe, expect, test } from "bun:test";
import type { LocationResponse } from "../../../models/location";
import { mapLocationToPayloadFormat } from "./location-payload.mapper";

describe("mapLocationToPayloadFormat accommodations", () => {
  test("does not include removed LM-only fields in synced payload", () => {
    const location = {
      id: 1,
      title: "Stay Test",
      category: "accommodations",
      type: "hotel",
      locationKey: "peru|lima|miraflores",
      district: "Miraflores",
      ianaTimeId: "America/Lima",
      placeId: "google-place-id",
      tripadvisorUrl: "https://www.tripadvisor.com/Hotel_Review-test",
      payload_location_ref: "456",
      neighborhoodDescription: "Near the beach",
      idealFor: null,
      nightlifeDetails: null,
      accommodationsDetails: {
        core: { name: "Stay Test", district: "Miraflores" },
        the_stay: { wifi: true },
        the_experience: { vibe: ["Luxury"] },
        the_details: { address: "Main Street 100" },
      },
      attractionsDetails: null,
      keyLocationsDetails: null,
      operationHours: { monday: "9-5", currently_open: true },
      tripadvisorMealTypes: null,
      tripadvisorCuisines: null,
      tripadvisorFeatures: null,
      priceLevel: "$$",
      contact: {
        countryCode: "PE",
        phoneNumber: "+51 999 999 999",
        website: "https://stay.example.com",
        email: "hello@stay.example.com",
        contactAddress: "Secondary contact address",
        url: "https://maps.google.com/?q=stay",
      },
      coordinates: { lat: -12.12, lng: -77.03 },
      source: { name: "Stay Test Source", address: "Source Address 123" },
      instagram_embeds: [],
      uploads: [],
      slug: null,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    } as unknown as LocationResponse;

    const payload = mapLocationToPayloadFormat(
      location,
      { galleryImageIds: [], instagramPostIds: [] },
      "456"
    );

    expect(payload).toHaveProperty("core");
    expect(payload).toHaveProperty("theStay");
    expect(payload).toHaveProperty("theExperience");
    expect(payload).toHaveProperty("theDetails");

    expect(payload).not.toHaveProperty("operationHours");
    expect(payload).not.toHaveProperty("neighborhoodDescription");
    expect(payload).not.toHaveProperty("tripadvisorUrl");
    expect(payload).not.toHaveProperty("district");
    expect(payload).not.toHaveProperty("sourceAddress");
    expect(payload).not.toHaveProperty("placeId");
    expect(payload).not.toHaveProperty("contactAddress");
    expect(payload).not.toHaveProperty("locationKey");
    expect(payload).not.toHaveProperty("tripadvisorLocationId");
  });

  test("drops LM-only none and keeps Payload parking/jacuzzi/pool options", () => {
    const location = {
      id: 2,
      title: "Filter Test",
      category: "accommodations",
      type: "hotel",
      locationKey: "peru|lima|miraflores",
      district: "Miraflores",
      ianaTimeId: "America/Lima",
      payload_location_ref: "999",
      neighborhoodDescription: null,
      idealFor: null,
      nightlifeDetails: null,
      accommodationsDetails: {
        core: { name: "Filter Test", price: "$$", district: "Miraflores", type: "hotel" },
        the_stay: {
          perfect_for: ["Solo"],
          kid_friendly: true,
          ac: true,
          wifi: true,
          extra_guest_fee: false,
          parking: ["none", "onsite", "garage"],
          breakfast_served: true,
        },
        the_experience: {
          vibe: ["Luxury"],
          workspace: ["Dedicated Desk", "Shared Lounge"],
          restaurant: false,
          pool: ["none", "rooftop"],
          rooftop_lounge: false,
          jacuzzi: ["none", "shared"],
          gym: "Basic",
        },
        the_details: {
          address: "Av. Test 1",
          walkability: "Walkable Downtown",
          check_in_time: "15:00",
          check_out_time: "11:00",
          phone: "+51 1",
          website_url: "https://example.com",
        },
      },
      attractionsDetails: null,
      keyLocationsDetails: null,
      operationHours: null,
      tripadvisorMealTypes: null,
      tripadvisorCuisines: null,
      tripadvisorFeatures: null,
      priceLevel: "$$",
      contact: {
        countryCode: "PE",
        phoneNumber: "+51 1",
        website: "https://example.com",
        url: "https://maps.google.com/?q=test",
      },
      coordinates: { lat: -12.0, lng: -77.0 },
      source: { name: "Filter Test", address: "Av. Test 1" },
      instagram_embeds: [],
      uploads: [],
      slug: null,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    } as unknown as LocationResponse;

    const payload = mapLocationToPayloadFormat(
      location,
      { galleryImageIds: [], instagramPostIds: [] },
      "999"
    );

    expect(payload.theStay?.parking).toEqual(["onsite", "garage"]);
    expect(payload.theExperience?.jacuzzi).toEqual(["shared"]);
    expect(payload.theExperience?.pool).toEqual(["rooftop"]);
    expect(payload.theExperience?.workspace).toBe("Dedicated Desk");
  });
});
