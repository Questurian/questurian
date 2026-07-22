import { describe, expect, test } from "bun:test";
import type { Location } from "../models/location";
import { transformLocationToBasicResponse } from "./location-utils";

interface LocationWithCounts extends Location {
  uploadsCount: number;
  instagramEmbedsCount: number;
}

function buildDiningLocation(
  overrides: Partial<LocationWithCounts> = {}
): LocationWithCounts {
  return {
    id: 293,
    name: "Nitido Coffee Co",
    title: "Nitido Coffee Co",
    address: "Av. Ricardo Rivera Navarrete 585, San Isidro 15046, Peru",
    url: "https://maps.google.com/?q=Nitido+Coffee+Co",
    category: "dining",
    type: "cafe",
    locationKey: "peru|lima|san-isidro",
    district: "San Isidro",
    countryCode: "PE",
    ianaTimeId: "America/Lima",
    phoneNumber: "+51 1 555-0100",
    website: "https://nitido.coffee/",
    lat: -12.0930115,
    lng: -77.026602,
    hoursJson: JSON.stringify({
      hours: [{ day: "Monday", hours: "07:00:00 - 21:00:00" }],
    }),
    idealForJson: JSON.stringify(["Breakfast", "Coffee & Light Bites"]),
    tripadvisorCuisinesJson: JSON.stringify(["Coffee & Tea"]),
    priceLevel: "$",
    uploadsCount: 1,
    instagramEmbedsCount: 0,
    ...overrides,
  };
}

describe("dining completeness", () => {
  test("marks dining complete when phone is missing", () => {
    const location = buildDiningLocation({
      phoneNumber: null,
      phoneUnavailable: false,
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.isComplete).toBe(true);
  });

  test("does not count an empty canonical hours array as complete", () => {
    const location = buildDiningLocation({
      hoursJson: JSON.stringify({ hours: [] }),
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.isComplete).toBe(false);
  });

  test("marks dining complete when operator confirmed phone is unavailable", () => {
    const location = buildDiningLocation({
      phoneNumber: null,
      phoneUnavailable: true,
    });

    const basic = transformLocationToBasicResponse(location);

    expect(basic.category).toBe("dining");
    expect(basic.isComplete).toBe(true);
  });
});
