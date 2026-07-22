import { describe, expect, test } from "bun:test";
import type { Location } from "../models/location";
import { transformLocationToBasicResponse } from "./location-utils";

interface LocationWithCounts extends Location {
  uploadsCount: number;
  instagramEmbedsCount: number;
}

function buildAttractionsDetails(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  const details: Record<string, unknown> = {
    core: {
      attraction_type: "museum",
      pricing: "$$",
      location_key: "peru|lima|pueblo-libre",
    },
    visit: {
      hours: {
        monday: "9:00 AM - 10:00 PM",
      },
      booking_required: false,
    },
    contact: {
      website: "https://example.com/larco-museum",
      phone: "+51 1 461-1312",
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

function buildAttractionsLocation(
  overrides: Partial<LocationWithCounts> = {}
): LocationWithCounts {
  return {
    id: 21,
    name: "Larco Museum",
    title: "Larco Museum",
    address: "Av. Simón Bolívar 1515, Pueblo Libre, Lima",
    url: "https://maps.google.com/?q=Larco+Museum",
    category: "attractions",
    type: "museum",
    locationKey: "peru|lima|pueblo-libre",
    district: "Pueblo Libre",
    countryCode: "PE",
    ianaTimeId: "America/Lima",
    phoneNumber: "+51 1 461-1312",
    website: "https://example.com/larco-museum",
    lat: -12.0718,
    lng: -77.0708,
    attractionsDetailsJson: JSON.stringify(buildAttractionsDetails()),
    hoursJson: JSON.stringify({
      monday: "9:00 AM - 10:00 PM",
      notes: "Last entry 9:00 PM",
    }),
    priceLevel: "$$",
    uploadsCount: 1,
    instagramEmbedsCount: 0,
    ...overrides,
  };
}

describe("attractions completeness", () => {
  test("marks attractions location complete when required fields are present", () => {
    const location = buildAttractionsLocation();

    const basic = transformLocationToBasicResponse(location);

    expect(basic.category).toBe("attractions");
    expect(basic.country).toBe("peru");
    expect(basic.type).toBe("museum");
    expect(basic.isComplete).toBe(true);
  });

  test("marks attractions location complete when website is missing", () => {
    const location = buildAttractionsLocation({
      website: null,
      attractionsDetailsJson: JSON.stringify(
        buildAttractionsDetails({
          contact: {
            phone: "+51 1 461-1312",
          },
        })
      ),
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.category).toBe("attractions");
    expect(basic.isComplete).toBe(true);
  });

  test("marks attractions location complete when pricing and phone are missing", () => {
    const details = buildAttractionsDetails({
      core: {
        attraction_type: "museum",
        location_key: "peru|lima|pueblo-libre",
      },
      contact: {},
    });
    const location = buildAttractionsLocation({
      attractionsDetailsJson: JSON.stringify(details),
      phoneNumber: null,
      priceLevel: null,
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.isComplete).toBe(true);
  });

  test("marks attractions incomplete when location key and district are missing", () => {
    const location = buildAttractionsLocation({
      locationKey: null,
      district: null,
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.isComplete).toBe(false);
  });

  test("treats selected Payload media sets as satisfying media completeness", () => {
    const location = buildAttractionsLocation({
      uploadsCount: 0,
      selectedPayloadMediaSetIdsJson: JSON.stringify(["media-1", "media-2"]),
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.category).toBe("attractions");
    expect(basic.isComplete).toBe(true);
  });

  test("marks attractions location incomplete when representative required fields are missing", () => {
    const incompleteDetails = buildAttractionsDetails({
      visit: {
        hours: {},
      },
    });

    const location = buildAttractionsLocation({
      website: null,
      attractionsDetailsJson: JSON.stringify(incompleteDetails),
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.category).toBe("attractions");
    expect(basic.isComplete).toBe(false);
  });
});
