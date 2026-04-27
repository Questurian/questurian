import { describe, expect, test } from "bun:test";
import type { LocationResponse } from "../models/location";
import type { Review2BlogExportReview } from "../types/translate-merge-reviews.types";
import { buildAiJsonPayload } from "./tripadvisor-ai-json.utils";

const sampleReviews: Review2BlogExportReview[] = [
  {
    reviewId: "rev_1",
    source: "google",
    date: "2025-01-15",
    rating: 5,
    text: "Amazing ceviche and warm service in a lively room.",
  },
];

function buildEditorial(district: string) {
  return {
    placement_type: "curated guide",
    selection_angle: "review-backed pick for travelers",
    audience: "travelers",
    tone: "grounded_editorial",
    must_mention: district ? [district] : [],
    avoid: ["best"],
  };
}

function buildLocationResponse(overrides: Partial<LocationResponse> = {}): LocationResponse {
  return {
    id: 1,
    title: "Sample Title",
    category: "dining",
    type: "restaurant",
    locationKey: "peru|lima|barranco",
    district: "Barranco",
    ianaTimeId: "America/Lima",
    placeId: "place_123",
    tripadvisorUrl: "https://www.tripadvisor.com/Restaurant_Review-g123",
    tripadvisorLocationId: "123",
    payload_location_ref: null,
    selectedPayloadMediaSetIds: null,
    tourIds: null,
    tours: [],
    neighborhoodDescription: null,
    idealFor: ["date night", "seafood lovers"],
    nightlifeDetails: null,
    accommodationsDetails: null,
    attractionsDetails: null,
    keyLocationsDetails: null,
    operationHours: {
      hours: [
        { day: "Monday", hours: "12:00-22:00" },
      ],
    },
    tripadvisorMealTypes: ["Lunch", "Dinner"],
    tripadvisorCuisines: ["Peruvian", "Seafood"],
    tripadvisorFeatures: ["Reservations", "Outdoor Seating", "Cocktails"],
    priceLevel: "$$$",
    contact: {
      countryCode: "PE",
      phoneNumber: "+51 999 999 999",
      website: "https://example.com",
      email: "hello@example.com",
      contactAddress: "Barranco",
      url: "https://maps.google.com/?q=barranco",
    },
    coordinates: {
      lat: -12.1414,
      lng: -77.022,
    },
    source: {
      name: "Mar y Sol",
      address: "Barranco, Lima, Peru",
    },
    instagram_embeds: [],
    uploads: [],
    slug: "mar-y-sol",
    reviewsFetchedAt: "2026-03-06T00:00:00.000Z",
    reviewsCount: 1,
    reviewsGoogleCount: 1,
    reviewsTripadvisorCount: 0,
    reviewsEnabled: true,
    created_at: "2026-03-06T00:00:00.000Z",
    updated_at: "2026-03-06T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildAiJsonPayload", () => {
  test("exports dining locations with canonical review2blog fields", () => {
    const payload = buildAiJsonPayload(buildLocationResponse(), sampleReviews);

    expect(payload).toEqual({
      schemaVersion: "review2blog-export-v1",
      category: "dining",
      name: "Mar y Sol",
      type: "restaurant",
      district: "Barranco",
      locationKey: "peru|lima|barranco",
      editorial: buildEditorial("Barranco"),
      priceLevel: "$$$",
      idealFor: ["date night", "seafood lovers"],
      tripadvisorCuisines: ["Peruvian", "Seafood"],
      tripadvisorMealTypes: ["Lunch", "Dinner"],
      tripadvisorFeatures: ["Reservations", "Outdoor Seating", "Cocktails"],
      operationHours: {
        hours: [
          { day: "Monday", hours: "12:00-22:00" },
        ],
      },
      facts: {
        cuisines: ["Peruvian", "Seafood"],
        mealTypes: ["Lunch", "Dinner"],
        features: ["Reservations", "Outdoor Seating", "Cocktails"],
        operationHours: [
          { day: "Monday", hours: "12:00-22:00" },
        ],
      },
      reviews: sampleReviews,
    });
  });

  test("exports accommodations locations with canonical nested details", () => {
    const payload = buildAiJsonPayload(
      buildLocationResponse({
        category: "accommodations",
        source: { name: "Casa Azul Hotel", address: "Barranco, Lima, Peru" },
        title: "Casa Azul Hotel",
        type: null,
        priceLevel: null,
        idealFor: null,
        tripadvisorMealTypes: null,
        tripadvisorCuisines: null,
        tripadvisorFeatures: null,
        operationHours: null,
        accommodationsDetails: {
          core: {
            type: "boutique",
            price: "$$$",
            district: "Barranco",
          },
          the_stay: {
            perfect_for: ["couples", "remote workers"],
            kid_friendly: false,
            wifi: true,
            ac: true,
            breakfast_served: true,
            parking: ["onsite"],
          },
          the_experience: {
            vibe: ["quiet", "design-forward"],
            workspace: "strong",
            pool: ["rooftop"],
            rooftop_lounge: true,
            gym: "small",
          },
          the_details: {
            walkability: "high",
          },
        },
      }),
      [
        {
          reviewId: "rev_1",
          source: "google",
          date: "2025-01-15",
          rating: 4,
          text: "Quiet rooms, strong Wi-Fi, and a great rooftop for sunset.",
        },
      ]
    );

    expect(payload).toEqual({
      schemaVersion: "review2blog-export-v1",
      category: "accommodations",
      name: "Casa Azul Hotel",
      type: "boutique",
      district: "Barranco",
      locationKey: "peru|lima|barranco",
      editorial: buildEditorial("Barranco"),
      priceLevel: "$$$",
      idealFor: ["couples", "remote workers"],
      accommodationsDetails: {
        core: {
          type: "boutique",
          district: "Barranco",
          price: "$$$",
        },
        the_stay: {
          perfect_for: ["couples", "remote workers"],
          kid_friendly: false,
          wifi: true,
          ac: true,
          breakfast_served: true,
          parking: ["onsite"],
        },
        the_experience: {
          vibe: ["quiet", "design-forward"],
          workspace: "strong",
          pool: ["rooftop"],
          rooftop_lounge: true,
          gym: "small",
        },
        the_details: {
          walkability: "high",
        },
      },
      facts: {
        perfectFor: ["couples", "remote workers"],
        kidFriendly: false,
        wifi: true,
        ac: true,
        breakfastServed: true,
        parking: ["onsite"],
        vibe: ["quiet", "design-forward"],
        workspace: "strong",
        pool: ["rooftop"],
        rooftopLounge: true,
        gym: "small",
        walkability: "high",
      },
      reviews: [
        {
          reviewId: "rev_1",
          source: "google",
          date: "2025-01-15",
          rating: 4,
          text: "Quiet rooms, strong Wi-Fi, and a great rooftop for sunset.",
        },
      ],
    });
  });

  test("exports attractions locations with canonical visit data", () => {
    const payload = buildAiJsonPayload(
      buildLocationResponse({
        category: "attractions",
        source: { name: "Museo de Arte", address: "Lima Centro, Peru" },
        title: "Museo de Arte",
        type: null,
        priceLevel: null,
        district: "Lima Centro",
        locationKey: "peru|lima|lima-centro",
        idealFor: null,
        tripadvisorMealTypes: null,
        tripadvisorCuisines: null,
        tripadvisorFeatures: null,
        operationHours: null,
        attractionsDetails: {
          core: {
            attraction_type: "museum",
            pricing: "$$",
            location_key: "peru|lima|lima-centro",
            district: "Lima Centro",
          },
          visit: {
            booking_required: false,
            ideal_for: ["history lovers", "families"],
            hours: {
              hours: [
                { day: "Tuesday", hours: "10:00-18:00" },
              ],
            },
          },
        },
      }),
      [
        {
          reviewId: "rev_1",
          source: "tripadvisor",
          date: "2025-01-15",
          rating: 5,
          text: "Beautiful collection and easy to spend two hours here.",
        },
      ]
    );

    expect(payload).toEqual({
      schemaVersion: "review2blog-export-v1",
      category: "attractions",
      name: "Museo de Arte",
      type: "museum",
      district: "Lima Centro",
      locationKey: "peru|lima|lima-centro",
      editorial: buildEditorial("Lima Centro"),
      priceLevel: "$$",
      idealFor: ["history lovers", "families"],
      attractionsDetails: {
        core: {
          attraction_type: "museum",
          pricing: "$$",
          district: "Lima Centro",
          location_key: "peru|lima|lima-centro",
        },
        visit: {
          booking_required: false,
          ideal_for: ["history lovers", "families"],
          hours: {
            hours: [
              { day: "Tuesday", hours: "10:00-18:00" },
            ],
          },
        },
      },
      operationHours: {
        hours: [
          { day: "Tuesday", hours: "10:00-18:00" },
        ],
      },
      facts: {
        attractionType: "museum",
        pricing: "$$",
        bookingRequired: false,
        idealFor: ["history lovers", "families"],
        operationHours: [
          { day: "Tuesday", hours: "10:00-18:00" },
        ],
      },
      reviews: [
        {
          reviewId: "rev_1",
          source: "tripadvisor",
          date: "2025-01-15",
          rating: 5,
          text: "Beautiful collection and easy to spend two hours here.",
        },
      ],
    });
  });

  test("exports nightlife locations with canonical scene structure", () => {
    const payload = buildAiJsonPayload(
      buildLocationResponse({
        category: "nightlife",
        source: { name: "Sombra Rooftop", address: "Barranco, Lima, Peru" },
        title: "Sombra Rooftop",
        type: null,
        priceLevel: null,
        idealFor: ["cocktails", "late-night dates"],
        tripadvisorMealTypes: null,
        tripadvisorCuisines: null,
        tripadvisorFeatures: null,
        nightlifeDetails: {
          club_type: "Cocktail Bar",
          price_tier: "$$$",
          music: ["house", "disco"],
          details: {
            theSpace: {
              venueType: { value: "rooftop" },
              venueSize: { value: "medium" },
              vibe: { value: ["stylish", "lively"] },
              peakHours: { value: "23:00-01:00" },
            },
            theScene: {
              dressCode: { value: ["smart casual"] },
              energyLevel: { value: "high" },
              crowdProfile: { value: "late-20s and 30s" },
              touristPresence: { value: "mixed" },
            },
          },
        },
        operationHours: {
          hours: [
            { day: "Friday", hours: "18:00-02:00" },
          ],
        },
      }),
      [
        {
          reviewId: "rev_1",
          source: "google",
          date: "2025-01-15",
          rating: 4,
          text: "Great cocktails, upbeat music, and a fun crowd after 11.",
        },
      ]
    );

    expect(payload).toEqual({
      schemaVersion: "review2blog-export-v1",
      category: "nightlife",
      name: "Sombra Rooftop",
      type: "Cocktail Bar",
      district: "Barranco",
      locationKey: "peru|lima|barranco",
      editorial: buildEditorial("Barranco"),
      priceLevel: "$$$",
      idealFor: ["cocktails", "late-night dates"],
      nightlifeDetails: {
        club_type: "Cocktail Bar",
        price_tier: "$$$",
        music: ["house", "disco"],
        details: {
          theSpace: {
            venueType: { value: "rooftop" },
            venueSize: { value: "medium" },
            vibe: { value: ["stylish", "lively"] },
            peakHours: { value: "23:00-01:00" },
          },
          theScene: {
            dressCode: { value: ["smart casual"] },
            energyLevel: { value: "high" },
            crowdProfile: { value: "late-20s and 30s" },
            touristPresence: { value: "mixed" },
          },
        },
        core: {
          clubType: "Cocktail Bar",
          priceTier: "$$$",
          idealFor: ["cocktails", "late-night dates"],
          music: ["house", "disco"],
        },
      },
      operationHours: {
        hours: [
          { day: "Friday", hours: "18:00-02:00" },
        ],
      },
      facts: {
        clubType: "Cocktail Bar",
        priceTier: "$$$",
        music: ["house", "disco"],
        venueType: "rooftop",
        venueSize: "medium",
        vibe: ["stylish", "lively"],
        peakHours: "23:00-01:00",
        dressCode: ["smart casual"],
        energyLevel: "high",
        crowdProfile: "late-20s and 30s",
        touristPresence: "mixed",
        operationHours: [
          { day: "Friday", hours: "18:00-02:00" },
        ],
      },
      reviews: [
        {
          reviewId: "rev_1",
          source: "google",
          date: "2025-01-15",
          rating: 4,
          text: "Great cocktails, upbeat music, and a fun crowd after 11.",
        },
      ],
    });
  });

  test("exports key locations with canonical location details", () => {
    const payload = buildAiJsonPayload(
      buildLocationResponse({
        category: "key_locations",
        source: { name: "Jorge Chávez International Airport", address: "Callao, Peru" },
        title: "Jorge Chávez International Airport",
        type: null,
        priceLevel: null,
        idealFor: [],
        locationKey: "peru|lima|callao",
        tripadvisorMealTypes: null,
        tripadvisorCuisines: null,
        tripadvisorFeatures: null,
        district: null,
        keyLocationsDetails: {
          location_type: "airport",
          neighborhood: "Callao",
          status: "active",
        },
        operationHours: {
          hours: [
            { day: "Daily", hours: "00:00-23:59" },
          ],
        },
      }),
      [
        {
          reviewId: "rev_1",
          source: "google",
          date: "2025-01-15",
          rating: 3,
          text: "Busy airport with long lines but clear signage.",
        },
      ]
    );

    expect(payload).toEqual({
      schemaVersion: "review2blog-export-v1",
      category: "key_locations",
      name: "Jorge Chávez International Airport",
      type: "airport",
      district: "Callao",
      locationKey: "peru|lima|callao",
      editorial: buildEditorial("Callao"),
      priceLevel: "",
      idealFor: [],
      keyLocationsDetails: {
        location_type: "airport",
        neighborhood: "Callao",
        status: "active",
        location_key: "peru|lima|callao",
      },
      operationHours: {
        hours: [
          { day: "Daily", hours: "00:00-23:59" },
        ],
      },
      facts: {
        locationType: "airport",
        neighborhood: "Callao",
        status: "active",
        operationHours: [
          { day: "Daily", hours: "00:00-23:59" },
        ],
      },
      reviews: [
        {
          reviewId: "rev_1",
          source: "google",
          date: "2025-01-15",
          rating: 3,
          text: "Busy airport with long lines but clear signage.",
        },
      ],
    });
  });
});
