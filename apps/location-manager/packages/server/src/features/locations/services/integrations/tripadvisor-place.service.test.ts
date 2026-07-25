import { beforeEach, describe, expect, mock, test } from "bun:test";
import { mockCoreRepository } from "../../../../test/repository-mocks";

// tripadvisor-place.repository is only mocked here, but the override still leaks to
// later files, so spread the real module rather than replacing it wholesale.
const actualTripAdvisorPlaceRepository = await import(
  "../../repositories/content/tripadvisor-place.repository"
);

const getLocationByIdForUpdateMock = mock(() => null as any);
const updateLocationByIdMock = mock(() => true);
const saveTripAdvisorPlaceMock = mock(() => 1);

mockCoreRepository({
  getLocationByIdForUpdate: getLocationByIdForUpdateMock,
  updateLocationById: updateLocationByIdMock,
});

mock.module("../../repositories/content/tripadvisor-place.repository", () => ({
  ...actualTripAdvisorPlaceRepository,
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

  test("operation hours from TripAdvisor overwrite existing manual hours", () => {
    getLocationByIdForUpdateMock.mockReturnValue({
      id: 14,
      category: "dining",
      type: "restaurant",
      email: null,
      neighborhoodDescription: null,
      hoursJson: JSON.stringify({ monday: "09:00:00 - 17:00:00", currently_open: false }),
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
    service.mergePlaceDataIntoLocation(14, {
      operation_hours: {
        monday: "10:00:00 - 23:00:00",
        currently_open: true,
      },
    });

    expect(updateLocationByIdMock).toHaveBeenCalledTimes(1);
    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      14,
      expect.objectContaining({
        hoursJson: JSON.stringify({
          monday: "10:00:00 - 23:00:00",
          currently_open: true,
        }),
      })
    );
  });

  test("operation hours from TripAdvisor overwrite existing nightlife hours", () => {
    getLocationByIdForUpdateMock.mockReturnValue({
      id: 15,
      category: "nightlife",
      type: "cocktail-bar",
      email: null,
      neighborhoodDescription: null,
      hoursJson: JSON.stringify({ monday: "20:00:00 - 02:00:00", currently_open: false }),
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
    service.mergePlaceDataIntoLocation(15, {
      operation_hours: {
        monday: "21:00:00 - 03:00:00",
        currently_open: true,
      },
    });

    expect(updateLocationByIdMock).toHaveBeenCalledTimes(1);
    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      15,
      expect.objectContaining({
        hoursJson: JSON.stringify({
          monday: "21:00:00 - 03:00:00",
          currently_open: true,
        }),
      })
    );
  });

  test("missing TripAdvisor operation hours preserves existing nightlife hours", () => {
    getLocationByIdForUpdateMock.mockReturnValue({
      id: 16,
      category: "nightlife",
      type: "cocktail-bar",
      email: "team@example.com",
      neighborhoodDescription: "By the park",
      hoursJson: JSON.stringify({ monday: "20:00:00 - 02:00:00", currently_open: false }),
      phoneNumber: "+51 999 555 444",
      website: "https://example.com/club",
      tripadvisorMealTypesJson: JSON.stringify(["Dinner"]),
      tripadvisorCuisinesJson: JSON.stringify(["Fusion"]),
      tripadvisorFeaturesJson: JSON.stringify(["Reservations"]),
      priceLevel: "$$$",
      district: "Miraflores",
      idealForJson: JSON.stringify(["Date Nights"]),
    });

    const service = new TripAdvisorPlaceService({ SERPAPI_KEY: "test-key" } as any);
    service.mergePlaceDataIntoLocation(16, {});

    expect(updateLocationByIdMock).toHaveBeenCalledTimes(0);
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
