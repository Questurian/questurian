import {
  buildNightlifeDetails,
  buildNightlifeFieldUpdatePayload,
  getNightlifeFieldDraftValue,
  parseNightlifeDetails,
} from "./nightlife-details";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
};

const baseInput = {
  name: "Nebula",
  priceTier: "$$$",
  clubType: "Dance Club",
  music: ["House", "EDM"],
  venueType: "Nightclub",
  venueSize: "Large",
  spaceLayout: ["Indoor", "Main Dance Floor"],
  vibe: ["High-Energy", "Exclusive"],
  peakHours: "1:00 AM - 3:30 AM",
  touristPresence: "High",
  musicFormat: ["Resident DJs"],
  dressCode: ["Upscale"],
  energyLevel: "Very High",
  vipAndBottleService: "Yes",
  crowdProfile: "25-35",
  location: "123 Main St, Lima",
  phone: "+51 555-1234",
  hours: "Fri-Sat 10 PM - 5 AM",
  website: "https://nebula.example.com",
  bookingUrl: "https://nebula.example.com/reserve",
  daytimeRestaurant: "0",
};

describe("nightlife details helpers", () => {
  test("parses wrapped nightlife detail values", () => {
    const parsed = parseNightlifeDetails(buildNightlifeDetails(baseInput));

    expect(parsed.clubType).toBe("Dance Club");
    expect(parsed.venueType).toBe("Nightclub");
    expect(parsed.vibe).toEqual(["High-Energy", "Exclusive"]);
    expect(parsed.musicFormat).toEqual(["Resident DJs"]);
    expect(parsed.daytimeRestaurant).toBe("0");
  });

  test("parses legacy simple nightlife values", () => {
    const parsed = parseNightlifeDetails({
      club_type: "Cocktail Bar",
      music: "House",
      details: {
        theSpace: {
          peakHours: "12:00 AM - 2:00 AM",
          venueType: "Lounge",
        },
        theScene: {
          energyLevel: "High",
          dressCode: "Smart Casual",
        },
      },
      daytime_restaurant: 1,
    });

    expect(parsed.music).toEqual(["House"]);
    expect(parsed.peakHours).toBe("12:00 AM - 2:00 AM");
    expect(parsed.venueType).toBe("Lounge");
    expect(parsed.energyLevel).toBe("High");
    expect(parsed.dressCode).toEqual(["Smart Casual"]);
    expect(parsed.daytimeRestaurant).toBe("1");
  });

  test("merges one nightlife field without dropping unrelated details", () => {
    const payload = buildNightlifeFieldUpdatePayload(
      buildNightlifeDetails(baseInput),
      "nightlife.vibe",
      ["Trendy", "Immersive"]
    );

    expect((payload.nightlifeDetails.name as string)).toBe("Nebula");
    expect((payload.nightlifeDetails.booking_url as string)).toBe("https://nebula.example.com/reserve");
    expect(
      (
        (payload.nightlifeDetails.details as Record<string, unknown>).theScene as Record<
          string,
          { value: string }
        >
      ).energyLevel.value
    ).toBe("Very High");
    expect(getNightlifeFieldDraftValue(payload.nightlifeDetails, "nightlife.vibe")).toEqual([
      "Trendy",
      "Immersive",
    ]);
  });

  test("syncs club type and price tier updates to top-level payload fields", () => {
    const clubPayload = buildNightlifeFieldUpdatePayload(
      buildNightlifeDetails(baseInput),
      "nightlife.clubType",
      "Night Club"
    );
    const pricePayload = buildNightlifeFieldUpdatePayload(
      buildNightlifeDetails(baseInput),
      "nightlife.priceTier",
      "$$$$"
    );

    expect(clubPayload.type).toBe("Night Club");
    expect((clubPayload.nightlifeDetails.club_type as string)).toBe("Night Club");
    expect(pricePayload.priceLevel).toBe("$$$$");
    expect((pricePayload.nightlifeDetails.price_tier as string)).toBe("$$$$");
  });

  test("round-trips daytime restaurant values with the existing 0/1 contract", () => {
    const built = buildNightlifeDetails({
      ...baseInput,
      daytimeRestaurant: "1",
    });
    const updated = buildNightlifeFieldUpdatePayload(
      built,
      "nightlife.daytimeRestaurant",
      "0"
    );

    expect(parseNightlifeDetails(built).daytimeRestaurant).toBe("1");
    expect(parseNightlifeDetails(updated.nightlifeDetails).daytimeRestaurant).toBe("0");
  });

  test("treats invalid JSON and empty scalar values as empty details", () => {
    const invalid = buildNightlifeFieldUpdatePayload("{bad json", "nightlife.clubType", "  ");
    const parsed = parseNightlifeDetails({
      name: "  ",
      club_type: "",
      music: ["House", "", "  "],
    });

    expect(invalid.nightlifeDetails).toEqual({ club_type: "" });
    expect(parsed.hasDetails).toBe(true);
    expect(parsed.name).toBe(null);
    expect(parsed.clubType).toBe(null);
    expect(parsed.music).toEqual(["House"]);
  });

  test("falls back to legacy tourist presence under theSpace", () => {
    const parsed = parseNightlifeDetails({
      details: {
        theSpace: {
          touristPresence: { label: "Tourist Presence", value: "Medium" },
        },
      },
    });

    expect(parsed.touristPresence).toBe("Medium");
  });
});
