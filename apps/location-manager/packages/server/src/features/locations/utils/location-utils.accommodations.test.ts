import { describe, expect, test } from "bun:test";
import type { Location } from "../models/location";
import { transformLocationToBasicResponse } from "./location-utils";

interface LocationWithCounts extends Location {
  uploadsCount: number;
  instagramEmbedsCount: number;
}

function buildAccommodationsDetails(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  const details: Record<string, unknown> = {
    core: {
      name: "The Meridian Grand",
      price: "$$$$",
      district: "Financial District",
      type: "Hotel",
    },
    the_stay: {
      perfect_for: ["Solo", "Couples", "Groups"],
      kid_friendly: true,
      ac: true,
      wifi: true,
      extra_guest_fee: true,
      parking: ["onsite", "valet"],
      breakfast_served: true,
    },
    the_experience: {
      vibe: ["Luxury", "Social"],
      workspace: "Dedicated Desk",
      restaurant: true,
      pool: ["indoor", "rooftop"],
      rooftop_lounge: true,
      jacuzzi: ["private", "rooftop"],
      gym: "24/7",
    },
    the_details: {
      address: "220 Market Street, Financial District",
      walkability: "Walkable Downtown",
      check_in_time: "15:00",
      check_out_time: "11:00",
      phone: "+1 (555) 700-1200",
      website_url: "https://example.com/meridian-grand",
      booking_url: "https://example.com/meridian-grand/book",
      google_maps_url: "https://maps.google.com/?q=220+Market+Street+Miami",
    },
  };

  if (!overrides) {
    return details;
  }

  return {
    ...details,
    ...overrides,
  };
}

function buildAccommodationsLocation(
  overrides: Partial<LocationWithCounts> = {}
): LocationWithCounts {
  return {
    id: 42,
    name: "The Meridian Grand",
    title: "The Meridian Grand",
    address: "220 Market Street, Financial District",
    url: "https://maps.google.com/?q=220+Market+Street+Miami",
    category: "accommodations",
    type: "Hotel",
    locationKey: "united-states|miami|financial-district",
    district: "Financial District",
    countryCode: "US",
    ianaTimeId: "America/New_York",
    phoneNumber: "+1 (555) 700-1200",
    website: "https://example.com/meridian-grand",
    lat: 25.7743,
    lng: -80.1937,
    accommodationsDetailsJson: JSON.stringify(buildAccommodationsDetails()),
    priceLevel: "$$$$",
    uploadsCount: 1,
    instagramEmbedsCount: 0,
    ...overrides,
  };
}

describe("accommodations completeness", () => {
  test("marks accommodations location complete when required fields are present", () => {
    const location = buildAccommodationsLocation();

    const basic = transformLocationToBasicResponse(location);

    expect(basic.category).toBe("accommodations");
    expect(basic.country).toBe("united-states");
    expect(basic.type).toBe("Hotel");
    expect(basic.isComplete).toBe(true);
  });

  test("marks accommodations complete when phone is missing", () => {
    const details = buildAccommodationsDetails({
      the_details: {
        address: "220 Market Street, Financial District",
        walkability: "Walkable Downtown",
        check_in_time: "15:00",
        check_out_time: "11:00",
        website_url: "https://example.com/meridian-grand",
      },
    });
    const location = buildAccommodationsLocation({
      phoneNumber: null,
      accommodationsDetailsJson: JSON.stringify(details),
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.isComplete).toBe(true);
  });

  test("treats workspace as complete when stored as string array (form shape)", () => {
    const details = buildAccommodationsDetails({
      the_experience: {
        vibe: ["Luxury", "Social"],
        workspace: ["Dedicated Desk", "Shared Lounge"],
        restaurant: true,
        pool: ["indoor", "rooftop"],
        rooftop_lounge: true,
        jacuzzi: ["private", "rooftop"],
        gym: "24/7",
      },
    });

    const location = buildAccommodationsLocation({
      accommodationsDetailsJson: JSON.stringify(details),
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.isComplete).toBe(true);
  });

  test("marks accommodations location incomplete when representative required fields are missing", () => {
    const incompleteDetails = buildAccommodationsDetails({
      the_stay: {
        perfect_for: [],
        kid_friendly: true,
        ac: true,
        wifi: true,
        extra_guest_fee: true,
        parking: ["onsite"],
        breakfast_served: true,
      },
      the_experience: {
        vibe: ["Luxury"],
        workspace: "Dedicated Desk",
        restaurant: true,
        pool: ["indoor"],
        rooftop_lounge: true,
        jacuzzi: ["shared"],
        gym: "24/7",
      },
      the_details: {
        address: "220 Market Street, Financial District",
        walkability: "Walkable Downtown",
        check_in_time: "15:00",
        check_out_time: "",
        phone: "+1 (555) 700-1200",
        website_url: "https://example.com/meridian-grand",
        booking_url: "",
        google_maps_url: "",
      },
    });

    const location = buildAccommodationsLocation({
      accommodationsDetailsJson: JSON.stringify(incompleteDetails),
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.category).toBe("accommodations");
    expect(basic.isComplete).toBe(false);
  });
});
