import { describe, expect, test } from "bun:test";
import { mapFoursquarePlaceToAccommodationsHints } from "./foursquare-accommodations.mapper";

describe("mapFoursquarePlaceToAccommodationsHints", () => {
  test("maps structured Foursquare price, audience, wifi, and parking fields", () => {
    const result = mapFoursquarePlaceToAccommodationsHints({
      fsq_id: "fsq_123",
      price: 3,
      features: {
        amenities: {
          wifi: "free",
          parking: {
            valet_parking: {},
            street_parking: {},
            private_lot: {},
          },
        },
        attributes: {
          singles_popular: "likely",
          romantic: "very_likely",
          groups_popular: {},
        },
      },
    });

    expect(result).toEqual({
      source: "foursquare",
      foursquareId: "fsq_123",
      price: "$$$",
      perfectFor: ["Solo", "Couples", "Groups"],
      wifi: "yes",
      parking: ["valet", "street", "onsite"],
    });
  });

  test("maps amenity hints found in Foursquare text fields", () => {
    const result = mapFoursquarePlaceToAccommodationsHints({
      name: "Skyline Hotel",
      description: "Boutique hotel with air conditioning, rooftop pool, and free Wi-Fi.",
      tastes: ["couples", "infinity pool"],
      categories: [{ name: "Hotel" }],
    });

    expect(result).toEqual({
      source: "foursquare",
      perfectFor: ["Couples"],
      ac: "yes",
      wifi: "yes",
      pool: ["rooftop", "infinity"],
    });
  });
});
