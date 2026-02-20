import { describe, expect, test } from "bun:test";
import type { Location } from "../models/location";
import { transformLocationToBasicResponse } from "./location-utils";

interface LocationWithCounts extends Location {
  uploadsCount: number;
  instagramEmbedsCount: number;
}

function buildKeyLocationsDetails(
  overrides?: Partial<Record<string, unknown>>
): Record<string, unknown> {
  const details: Record<string, unknown> = {
    location_type: "airport",
    description: "Primary international airport",
    neighborhood: "Callao",
    status: "active",
    tags: ["airport", "international", "transport"],
    images: [
      "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=80",
    ],
    hours: {
      hours: [
        { day: "Sunday", hours: "00:00:00 - 23:59:59" },
      ],
    },
    phone: "+51 1 517-3100",
    website: "https://www.lima-airport.com",
    details: {
      access: {
        taxi: { available: true },
        rideshare: { available: true },
      },
      info: {
        terminals: { count: 1 },
        atm: { available: true },
      },
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

function buildKeyLocationsLocation(
  overrides: Partial<LocationWithCounts> = {}
): LocationWithCounts {
  return {
    id: 73,
    name: "Jorge Chavez International Airport",
    title: "Jorge Chavez International Airport",
    address: "Av. Elmer Faucett s/n, Callao",
    url: "https://maps.google.com/?q=Jorge+Chavez+International+Airport",
    category: "key_locations",
    type: "airport",
    locationKey: "peru|lima|callao",
    district: "Callao",
    countryCode: "PE",
    ianaTimeId: "America/Lima",
    phoneNumber: "+51 1 517-3100",
    website: "https://www.lima-airport.com",
    lat: -12.0219,
    lng: -77.1143,
    hoursJson: JSON.stringify({
      hours: [{ day: "Sunday", hours: "00:00:00 - 23:59:59" }],
    }),
    keyLocationsDetailsJson: JSON.stringify(buildKeyLocationsDetails()),
    uploadsCount: 1,
    instagramEmbedsCount: 0,
    ...overrides,
  };
}

describe("key locations completeness", () => {
  test("marks key locations complete when required fields are present", () => {
    const location = buildKeyLocationsLocation();

    const basic = transformLocationToBasicResponse(location);

    expect(basic.category).toBe("key_locations");
    expect(basic.isComplete).toBe(true);
  });

  test("marks key locations incomplete when representative required fields are missing", () => {
    const incompleteDetails = buildKeyLocationsDetails({
      status: "",
      details: {
        access: {},
        info: {},
      },
    });

    const location = buildKeyLocationsLocation({
      keyLocationsDetailsJson: JSON.stringify(incompleteDetails),
      website: null,
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.category).toBe("key_locations");
    expect(basic.isComplete).toBe(false);
  });
});
