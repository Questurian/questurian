import { beforeEach, describe, expect, mock, test } from "bun:test";

const getLocationByIdForUpdateMock = mock(() => null as any);
const updateLocationByIdMock = mock(() => true);
const saveTripAdvisorPlaceMock = mock(() => 1);

mock.module("../../repositories/core", () => ({
  getLocationByIdForUpdate: getLocationByIdForUpdateMock,
  updateLocationById: updateLocationByIdMock,
}));

mock.module("../../repositories/content/tripadvisor-place.repository", () => ({
  saveTripAdvisorPlace: saveTripAdvisorPlaceMock,
}));

const { TripAdvisorPlaceService } = await import("./tripadvisor-place.service");

describe("TripAdvisorPlaceService meal-type enrichment", () => {
  beforeEach(() => {
    getLocationByIdForUpdateMock.mockReset();
    updateLocationByIdMock.mockReset();
    saveTripAdvisorPlaceMock.mockReset();

    updateLocationByIdMock.mockReturnValue(true);
    saveTripAdvisorPlaceMock.mockReturnValue(1);
  });

  test("manual merge for dining populates derived fields from exact meal-type matches", () => {
    getLocationByIdForUpdateMock.mockReturnValue({
      id: 11,
      category: "dining",
      type: null,
      email: null,
      neighborhoodDescription: null,
      hoursJson: null,
      phoneNumber: null,
      website: null,
      tripadvisorMealTypesJson: null,
      tripadvisorCuisinesJson: null,
      tripadvisorFeaturesJson: null,
      priceLevel: null,
      district: null,
      idealForJson: null,
    });

    const service = new TripAdvisorPlaceService({ SERPAPI_KEY: "test-key" } as any);
    service.mergePlaceDataIntoLocation(11, {
      meal_types: ["Breakfast", "Brunch", "Lunch"],
    });

    expect(updateLocationByIdMock).toHaveBeenCalledTimes(1);
    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        tripadvisorMealTypesJson: JSON.stringify(["Breakfast", "Brunch", "Lunch"]),
        tripadvisorCuisinesJson: JSON.stringify(["Brunch"]),
        idealForJson: JSON.stringify(["Breakfast", "Brunch", "Lunch"]),
      })
    );
  });

  test("non-dining merge stores meal types but skips derived mapping", () => {
    getLocationByIdForUpdateMock.mockReturnValue({
      id: 12,
      category: "nightlife",
      type: null,
      email: null,
      neighborhoodDescription: null,
      hoursJson: null,
      phoneNumber: null,
      website: null,
      tripadvisorMealTypesJson: null,
      tripadvisorCuisinesJson: null,
      tripadvisorFeaturesJson: null,
      priceLevel: null,
      district: null,
      idealForJson: null,
    });

    const service = new TripAdvisorPlaceService({ SERPAPI_KEY: "test-key" } as any);
    service.mergePlaceDataIntoLocation(12, {
      meal_types: ["Breakfast", "Brunch", "Lunch"],
    });

    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        tripadvisorMealTypesJson: JSON.stringify(["Breakfast", "Brunch", "Lunch"]),
      })
    );
    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      12,
      expect.not.objectContaining({
        idealForJson: expect.anything(),
      })
    );
    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      12,
      expect.not.objectContaining({
        tripadvisorCuisinesJson: expect.anything(),
      })
    );
  });

  test("existing type is never overwritten by meal-type matches", () => {
    getLocationByIdForUpdateMock.mockReturnValue({
      id: 13,
      category: "dining",
      type: "bar",
      email: null,
      neighborhoodDescription: null,
      hoursJson: null,
      phoneNumber: null,
      website: null,
      tripadvisorMealTypesJson: null,
      tripadvisorCuisinesJson: null,
      tripadvisorFeaturesJson: null,
      priceLevel: null,
      district: null,
      idealForJson: null,
    });

    const service = new TripAdvisorPlaceService({ SERPAPI_KEY: "test-key" } as any);
    service.mergePlaceDataIntoLocation(13, {
      meal_types: ["Restaurant"],
    });

    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      13,
      expect.not.objectContaining({
        type: expect.anything(),
      })
    );
  });

  test("auto-fetch path applies meal-type enrichment through merge", async () => {
    getLocationByIdForUpdateMock.mockReturnValue({
      id: 20,
      category: "dining",
      type: null,
      email: null,
      neighborhoodDescription: null,
      hoursJson: null,
      phoneNumber: null,
      website: null,
      tripadvisorMealTypesJson: null,
      tripadvisorCuisinesJson: null,
      tripadvisorFeaturesJson: null,
      priceLevel: null,
      district: null,
      idealForJson: null,
    });

    const service = new TripAdvisorPlaceService({ SERPAPI_KEY: "test-key" } as any);
    (service as unknown as {
      serpApiClient: {
        isConfigured: () => boolean;
        fetchAndSavePlaceData: (
          locationId: number,
          tripadvisorLocationId: string
        ) => Promise<{ fetchedAt: string; placeResult: Record<string, unknown> }>;
      };
    }).serpApiClient = {
      isConfigured: () => true,
      fetchAndSavePlaceData: async () => ({
        fetchedAt: "2026-02-27T00:00:00.000Z",
        placeResult: {
          meal_types: ["Brunch", "Lunch"],
        },
      }),
    };

    const success = await service.fetchAndMergePlaceData(20, "12345");

    expect(success).toBe(true);
    expect(saveTripAdvisorPlaceMock).toHaveBeenCalledTimes(1);
    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      20,
      expect.objectContaining({
        tripadvisorMealTypesJson: JSON.stringify(["Brunch", "Lunch"]),
        tripadvisorCuisinesJson: JSON.stringify(["Brunch"]),
        idealForJson: JSON.stringify(["Brunch", "Lunch"]),
      })
    );
  });
});
