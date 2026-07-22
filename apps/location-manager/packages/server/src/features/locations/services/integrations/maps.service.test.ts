import { beforeEach, describe, expect, mock, test } from "bun:test";

const createFromMapsMock = mock(async (): Promise<any> => ({
  name: "Nebula",
  title: null,
  address: "123 Main St, Lima",
  url: "",
  category: "nightlife" as const,
  type: null,
}));
const findPotentialDuplicateLocationsMock = mock<() => any[]>(() => []);
const getLocationByIdForUpdateMock = mock<(id?: number) => any>(() => null as any);
const saveLocationOrThrowMock = mock(() => 101);
const setAttractionToursMock = mock(() => []);
const getAttractionToursMock = mock<(id?: number) => any[]>(() => []);
const updateLocationByIdMock = mock(() => true);
const getInstagramEmbedsByLocationIdMock = mock<(id?: number) => any[]>(() => []);
const getUploadsByLocationIdMock = mock<(id?: number) => any[]>(() => []);
const transformLocationToResponseMock = mock((location) => location as any);

mock.module("../geocoding/maps-location.factory", () => ({
  createFromMaps: createFromMapsMock,
}));

mock.module("../../repositories/core", () => ({
  findPotentialDuplicateLocations: findPotentialDuplicateLocationsMock,
  getLocationByIdForUpdate: getLocationByIdForUpdateMock,
  saveLocationOrThrow: saveLocationOrThrowMock,
  setAttractionTours: setAttractionToursMock,
  getAttractionTours: getAttractionToursMock,
  updateLocationById: updateLocationByIdMock,
}));

mock.module("../../repositories/content", () => ({
  getInstagramEmbedsByLocationId: getInstagramEmbedsByLocationIdMock,
  getUploadsByLocationId: getUploadsByLocationIdMock,
}));

mock.module("../../utils/location-utils", () => ({
  transformLocationToResponse: transformLocationToResponseMock,
}));

const { MapsService } = await import("./maps.service");

describe("MapsService nightlife TripAdvisor auto-fetch", () => {
  beforeEach(() => {
    createFromMapsMock.mockReset();
    findPotentialDuplicateLocationsMock.mockReset();
    getLocationByIdForUpdateMock.mockReset();
    saveLocationOrThrowMock.mockReset();
    setAttractionToursMock.mockReset();
    getAttractionToursMock.mockReset();
    updateLocationByIdMock.mockReset();
    getInstagramEmbedsByLocationIdMock.mockReset();
    getUploadsByLocationIdMock.mockReset();
    transformLocationToResponseMock.mockReset();

    createFromMapsMock.mockResolvedValue({
      name: "Nebula",
      title: null,
      address: "123 Main St, Lima",
      url: "",
      category: "nightlife",
      type: null,
    });
    findPotentialDuplicateLocationsMock.mockReturnValue([]);
    getLocationByIdForUpdateMock.mockReturnValue(null);
    saveLocationOrThrowMock.mockReturnValue(101);
    setAttractionToursMock.mockReturnValue([]);
    getAttractionToursMock.mockReturnValue([]);
    updateLocationByIdMock.mockReturnValue(true);
    getInstagramEmbedsByLocationIdMock.mockReturnValue([]);
    getUploadsByLocationIdMock.mockReturnValue([]);
    transformLocationToResponseMock.mockImplementation((location) => location as any);
  });

  test("nightlife create with TripAdvisor URL triggers place auto-fetch", async () => {
    const fetchAndMergePlaceDataMock = mock(async () => true);
    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: fetchAndMergePlaceDataMock } as any
    );

    await service.addMapsLocation(
      {
        name: "Nebula",
        title: "Nebula",
        address: "123 Main St, Lima",
        category: "nightlife",
        tripadvisorUrl:
          "https://www.tripadvisor.com/Restaurant_Review-g294316-d23520604-Reviews-Asu-Lima_Lima_Region.html",
      },
      "nightlife"
    );

    expect(fetchAndMergePlaceDataMock).toHaveBeenCalledTimes(1);
    expect(fetchAndMergePlaceDataMock).toHaveBeenCalledWith(101, "23520604");
  });

  test("allows a same-place entry when the existing document is in a different category", async () => {
    findPotentialDuplicateLocationsMock.mockReturnValue([
      {
        id: 77,
        name: "Nebula",
        title: "Nebula",
        address: "123 Main St, Lima",
        url: "https://example.com/dining/nebula",
        category: "dining",
        type: "restaurant",
      },
    ]);

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.addMapsLocation(
      {
        name: "Nebula",
        title: "Nebula",
        address: "123 Main St, Lima",
        category: "nightlife",
      },
      "nightlife"
    );

    expect(saveLocationOrThrowMock).toHaveBeenCalledTimes(1);
    expect(updateLocationByIdMock).not.toHaveBeenCalled();
  });

  test("still merges same-category duplicates instead of creating a second record", async () => {
    findPotentialDuplicateLocationsMock.mockReturnValue([
      {
        id: 77,
        name: "Nebula",
        title: "Nebula",
        address: "123 Main St, Lima",
        url: "https://example.com/nightlife/nebula",
        category: "nightlife",
        type: null,
        idealForJson: null,
      },
    ]);

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.addMapsLocation(
      {
        name: "Nebula",
        title: "Nebula",
        address: "123 Main St, Lima",
        category: "nightlife",
        idealFor: ["Late-Night Drinks"],
      },
      "nightlife"
    );

    expect(updateLocationByIdMock).toHaveBeenCalledTimes(1);
    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        idealForJson: JSON.stringify(["Late-Night Drinks"]),
      })
    );
    expect(saveLocationOrThrowMock).not.toHaveBeenCalled();
  });

  test("dedupes and preserves selected Payload media set order on attraction updates", async () => {
    const currentLocation = {
      id: 88,
      name: "Museum",
      title: "Museum",
      address: "123 Main St, Lima",
      url: "https://www.google.com/maps",
      category: "attractions",
      type: "museum",
    };

    getLocationByIdForUpdateMock.mockImplementation(() => currentLocation);
    getUploadsByLocationIdMock.mockReturnValue([{ id: 1 }, { id: 2 }]);

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.updateMapsLocationById(88, {
      selectedPayloadMediaSetIds: [" media-1 ", "media-2", "media-1"],
    } as any);

    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      88,
      expect.objectContaining({
        selectedPayloadMediaSetIdsJson: JSON.stringify(["media-1", "media-2"]),
      })
    );
  });

  test("rejects attraction updates when uploads plus selected Payload media exceed the gallery limit", async () => {
    const currentLocation = {
      id: 89,
      name: "Museum",
      title: "Museum",
      address: "123 Main St, Lima",
      url: "https://www.google.com/maps",
      category: "attractions",
      type: "museum",
    };

    getLocationByIdForUpdateMock.mockImplementation(() => currentLocation);
    getUploadsByLocationIdMock.mockReturnValue(
      Array.from({ length: 19 }, (_, index) => ({ id: index + 1 }))
    );

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await expect(
      service.updateMapsLocationById(89, {
        selectedPayloadMediaSetIds: ["media-1", "media-2"],
      } as any)
    ).rejects.toThrow("Attractions gallery supports up to 20 Payload media sets total.");

    expect(updateLocationByIdMock).not.toHaveBeenCalled();
  });

  test("links tours when creating an attraction", async () => {
    createFromMapsMock.mockResolvedValue({
      name: "Museum",
      title: null,
      address: "123 Main St, Lima",
      url: "https://www.google.com/maps",
      category: "attractions",
      type: "museum",
    });

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.addMapsLocation(
      {
        name: "Museum",
        title: "Museum",
        address: "123 Main St, Lima",
        category: "attractions",
        attractionsDetails: { core: { attraction_type: "museum" } },
        tourIds: [1, 2, 1],
      },
      "attractions"
    );

    expect(setAttractionToursMock).toHaveBeenCalledWith(101, [1, 2]);
  });

  test("persists dining menu and reservation urls on create", async () => {
    createFromMapsMock.mockResolvedValue({
      name: "Dining Test",
      title: null,
      address: "123 Main St, Lima",
      url: "https://www.google.com/maps",
      category: "dining",
      type: "restaurant",
    });

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.addMapsLocation(
      {
        name: "Dining Test",
        address: "123 Main St, Lima",
        category: "dining",
        idealFor: ["Date Nights"],
        menuUrl: "https://example.com/menu",
        bookingUrl: "https://example.com/reserve",
      },
      "dining"
    );

    expect(saveLocationOrThrowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        menuUrl: "https://example.com/menu",
        bookingUrl: "https://example.com/reserve",
      })
    );
  });

  test("updates attraction tour links without other field changes", async () => {
    const currentLocation = {
      id: 90,
      name: "Museum",
      title: "Museum",
      address: "123 Main St, Lima",
      url: "https://www.google.com/maps",
      category: "attractions",
      type: "museum",
    };

    getLocationByIdForUpdateMock.mockImplementation(() => currentLocation);

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.updateMapsLocationById(90, {
      tourIds: [3, 4, 3],
    } as any);

    expect(updateLocationByIdMock).not.toHaveBeenCalled();
    expect(setAttractionToursMock).toHaveBeenCalledWith(90, [3, 4]);
  });

  test("persists dining menu and reservation urls on update", async () => {
    const currentLocation = {
      id: 91,
      name: "Dining Test",
      title: "Dining Test",
      address: "123 Main St, Lima",
      url: "https://www.google.com/maps",
      category: "dining",
      type: "restaurant",
    };

    getLocationByIdForUpdateMock
      .mockImplementationOnce(() => currentLocation)
      .mockImplementationOnce(() => currentLocation);

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.updateMapsLocationById(91, {
      menuUrl: "https://example.com/menu",
      bookingUrl: "https://example.com/reserve",
    } as any);

    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      91,
      expect.objectContaining({
        menuUrl: "https://example.com/menu",
        bookingUrl: "https://example.com/reserve",
      })
    );
  });

  test("operator edit of a provenance-tracked field demotes it to operator", async () => {
    const currentLocation = {
      id: 92,
      name: "Dining Test",
      title: "Dining Test",
      address: "123 Main St, Lima",
      url: "https://www.google.com/maps",
      category: "dining",
      type: "italian",
      provenanceJson: JSON.stringify({ type: "google", bookingUrl: "ai" }),
    };

    getLocationByIdForUpdateMock.mockImplementation(() => currentLocation);

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.updateMapsLocationById(92, { type: "peruvian" } as any);

    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      92,
      expect.objectContaining({
        type: "peruvian",
        provenanceJson: JSON.stringify({ bookingUrl: "ai" }),
      })
    );
  });

  test("resubmitting an unchanged value keeps its provenance", async () => {
    const currentLocation = {
      id: 93,
      name: "Dining Test",
      title: "Dining Test",
      address: "123 Main St, Lima",
      url: "https://www.google.com/maps",
      category: "dining",
      type: "italian",
      provenanceJson: JSON.stringify({ type: "google" }),
    };

    getLocationByIdForUpdateMock.mockImplementation(() => currentLocation);

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.updateMapsLocationById(93, { type: "italian" } as any);

    expect(updateLocationByIdMock).not.toHaveBeenCalled();
  });

  test("resubmitting unchanged nullable contact fields does not touch the location", async () => {
    const currentLocation = {
      id: 95,
      name: "Malecón de Miraflores",
      title: "Malecón de Miraflores",
      address: "Miraflores, Lima",
      url: "https://www.google.com/maps",
      category: "attractions",
      type: "boardwalk",
      phoneNumber: null,
      phoneUnavailable: 1,
      website: null,
      attractionsDetailsJson: JSON.stringify({
        core: { attraction_type: "boardwalk" },
        contact: {},
      }),
    };

    getLocationByIdForUpdateMock.mockImplementation(() => currentLocation);

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.updateMapsLocationById(95, {
      phoneNumber: null,
      phoneUnavailable: true,
      attractionsDetails: {
        contact: {},
        core: { attraction_type: "boardwalk" },
      },
    } as any);

    expect(updateLocationByIdMock).not.toHaveBeenCalled();
  });

  test("resubmitting unchanged attraction tours does not rewrite links", async () => {
    const currentLocation = {
      id: 96,
      name: "Museum",
      title: "Museum",
      address: "123 Main St, Lima",
      url: "https://www.google.com/maps",
      category: "attractions",
      type: "museum",
    };

    getLocationByIdForUpdateMock.mockImplementation(() => currentLocation);
    getAttractionToursMock.mockReturnValue([{ id: 3 }, { id: 4 }]);

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.updateMapsLocationById(96, { tourIds: [3, 4, 3] } as any);

    expect(setAttractionToursMock).not.toHaveBeenCalled();
  });

  test("demoting the last provenance entry clears the sidecar column", async () => {
    const currentLocation = {
      id: 94,
      name: "Dining Test",
      title: "Dining Test",
      address: "123 Main St, Lima",
      url: "https://www.google.com/maps",
      category: "dining",
      type: "italian",
      bookingUrl: "https://resy.com/x",
      provenanceJson: JSON.stringify({ bookingUrl: "ai" }),
    };

    getLocationByIdForUpdateMock.mockImplementation(() => currentLocation);

    const service = new MapsService(
      { hasGoogleMapsKey: () => false } as any,
      { ensureTaxonomyEntry: () => true } as any,
      { applyCorrections: (value: string) => value } as any,
      {} as any,
      { fetchAndMergePlaceData: mock(async () => true) } as any
    );

    await service.updateMapsLocationById(94, {
      bookingUrl: "https://opentable.com/y",
    } as any);

    expect(updateLocationByIdMock).toHaveBeenCalledWith(
      94,
      expect.objectContaining({ provenanceJson: null })
    );
  });
});
