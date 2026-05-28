import { beforeEach, describe, expect, mock, test } from "bun:test";

const getLocationByIdMock = mock(() => null as any);
const resolveEntityIdsByPayloadRefsMock = mock(() => [] as any[]);

mock.module("../../repositories/core/location-read.repository", () => ({
  getLocationById: getLocationByIdMock,
}));

mock.module("../../repositories/integration/payload-sync.repository", () => ({
  resolveEntityIdsByPayloadRefs: resolveEntityIdsByPayloadRefsMock,
}));

const { getEditorialLocationsByPayloadRefs } = await import("./payload-refs.service");

describe("getEditorialLocationsByPayloadRefs", () => {
  beforeEach(() => {
    getLocationByIdMock.mockReset();
    resolveEntityIdsByPayloadRefsMock.mockReset();
  });

  test("returns structured nightlifeDetails from the LM location row", async () => {
    resolveEntityIdsByPayloadRefsMock.mockReturnValue([
      { collection: "nightlife", docId: "42", entityId: 7 },
    ]);
    getLocationByIdMock.mockReturnValue({
      id: 7,
      name: "Nebula",
      category: "nightlife",
      type: "Nightclub",
      priceLevel: "$$$",
      address: "Av. Example 123",
      neighborhoodDescription: "Late-night corridor",
      website: "https://nebula.example.com",
      menuUrl: null,
      bookingUrl: "https://nebula.example.com/reserve",
      hoursJson: JSON.stringify({ Friday: "22:00 - 04:00" }),
      tripadvisorCuisinesJson: null,
      idealForJson: JSON.stringify(["Friends Night"]),
      tripadvisorFeaturesJson: JSON.stringify(["Reservations"]),
      tripadvisorMealTypesJson: null,
      nightlifeDetailsJson: JSON.stringify({
        music: ["House"],
        details: {
          theSpace: {
            vibe: { label: "Vibe", value: ["High-Energy"] },
          },
          theScene: {
            musicFormat: { label: "Music", value: ["Resident DJs"] },
            crowdProfile: { label: "Age Range", value: "25-35" },
          },
        },
      }),
    });

    const results = await getEditorialLocationsByPayloadRefs([
      { collection: "nightlife", docId: "42" },
    ]);

    expect(results[0]).toMatchObject({
      found: true,
      collection: "nightlife",
      docId: "42",
      location: {
        nightlifeDetails: {
          music: ["House"],
          details: {
            theSpace: {
              vibe: { label: "Vibe", value: ["High-Energy"] },
            },
            theScene: {
              musicFormat: { label: "Music", value: ["Resident DJs"] },
              crowdProfile: { label: "Age Range", value: "25-35" },
            },
          },
        },
      },
    });
  });
});
