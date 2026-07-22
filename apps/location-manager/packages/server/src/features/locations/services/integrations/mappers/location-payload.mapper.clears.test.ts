import { describe, expect, test } from "bun:test";
import type { LocationCategory, LocationResponse } from "../../../models/location";
import { mapLocationToPayloadFormat } from "./location-payload.mapper";

function emptyLocation(category: LocationCategory): LocationResponse {
  return {
    id: 1,
    title: "Empty Test",
    category,
    type: null,
    locationKey: "peru|lima|miraflores",
    district: null,
    ianaTimeId: null,
    placeId: null,
    tripadvisorUrl: null,
    tripadvisorLocationId: null,
    menuUrl: null,
    bookingUrl: null,
    payload_location_ref: "123",
    selectedPayloadMediaSetIds: null,
    tourIds: null,
    tours: [],
    neighborhoodDescription: null,
    idealFor: null,
    nightlifeDetails: null,
    accommodationsDetails: null,
    attractionsDetails: null,
    keyLocationsDetails: null,
    operationHours: null,
    tripadvisorMealTypes: null,
    tripadvisorCuisines: null,
    tripadvisorFeatures: null,
    priceLevel: null,
    contact: {
      countryCode: null,
      phoneNumber: null,
      phoneUnavailable: true,
      website: null,
      email: null,
      contactAddress: null,
      url: "https://maps.google.com/?q=empty",
    },
    coordinates: { lat: null, lng: null },
    source: { name: "Empty Test", address: "Source Address" },
    instagram_embeds: [],
    uploads: [],
    slug: null,
    provenance: null,
    pendingSuggestions: null,
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
  };
}

function mapEmpty(category: LocationCategory) {
  return mapLocationToPayloadFormat(
    emptyLocation(category),
    { galleryImageIds: [], instagramPostIds: [], galleryUploadFailures: 0 },
    "123",
    category === "attractions" ? { tourPayloadIds: [] } : undefined
  );
}

describe("mapLocationToPayloadFormat clear contract", () => {
  test.each([
    "dining",
    "accommodations",
    "attractions",
    "nightlife",
    "key_locations",
  ] as const)("sends explicit shared clears for %s", (category) => {
    const payload = mapEmpty(category);
    expect(payload).toMatchObject({
      type: null,
      countryCode: null,
      phoneNumber: null,
      website: null,
      email: null,
      ianaTimeId: null,
      latitude: null,
      longitude: null,
    });
    if (category === "key_locations") {
      expect(payload).not.toHaveProperty("priceLevel");
    } else {
      expect(payload).toHaveProperty("priceLevel", null);
    }
  });

  test("sends explicit dining clears", () => {
    expect(mapEmpty("dining")).toMatchObject({
      operationHours: null,
      idealFor: [],
      cuisines: [],
      menuUrl: null,
      bookingUrl: null,
    });
  });

  test("sends explicit accommodations group clears", () => {
    expect(mapEmpty("accommodations")).toMatchObject({
      core: { name: null, price: null, district: null, type: null },
      theStay: {
        perfectFor: [],
        kidFriendly: false,
        ac: false,
        wifi: false,
        extraGuestFee: false,
        parking: [],
        breakfastServed: false,
      },
      theExperience: {
        vibe: [],
        workspace: null,
        restaurant: false,
        pool: [],
        rooftopLounge: false,
        jacuzzi: [],
        gym: null,
      },
      theDetails: {
        address: null,
        walkability: null,
        checkInTime: null,
        checkOutTime: null,
        phone: null,
        websiteUrl: null,
        bookingUrl: null,
        googleMapsUrl: null,
      },
    });
  });

  test("sends explicit attraction clears", () => {
    expect(mapEmpty("attractions")).toMatchObject({
      operationHours: null,
      attractionsDetails: {
        core: { attractionType: null, pricing: null },
        visit: { bookingRequired: false, bookingUrl: null },
      },
      tours: [],
    });
  });

  test("sends explicit nightlife group clears", () => {
    expect(mapEmpty("nightlife")).toMatchObject({
      nightlifeDetails: {
        core: {
          name: "Empty Test",
          clubType: null,
          priceTier: null,
          music: [],
          idealFor: [],
        },
        theSpace: {
          venueType: null,
          venueSize: null,
          spaceLayout: [],
          vibe: [],
          peakHours: null,
        },
        theScene: {
          musicFormat: [],
          touristPresence: null,
          dressCode: [],
          energyLevel: null,
          vipAndBottleService: null,
          crowdProfile: null,
        },
        theDetails: {
          operationHours: null,
          bookingUrl: null,
          daytimeRestaurant: false,
        },
      },
    });
  });

  test("sends explicit key-location clears", () => {
    expect(mapEmpty("key_locations")).toMatchObject({
      keyLocationStatus: null,
      operationHours: null,
      keyLocationsDetails: {
        core: { locationType: null, status: null, neighborhood: null },
      },
    });
  });
});
