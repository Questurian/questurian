import { beforeEach, describe, expect, mock, test } from "bun:test";

const getTaxonomyEntryMock = mock(() => null as any);
const insertPendingTaxonomyEntryMock = mock(() => null as any);
const approveTaxonomyEntryMock = mock(() => true);
const rejectTaxonomyEntryMock = mock(() => true);
const getPendingTaxonomyEntriesMock = mock(() => []);
const getLocationCountByTaxonomyMock = mock(() => 0);
const parseLocationValueMock = mock((locationKey: string) => {
  const [country, city, neighborhood] = locationKey.split("|");
  return {
    country,
    city: city || null,
    neighborhood: neighborhood || null,
    locationKey,
  };
});

mock.module("../../repositories/taxonomy", () => ({
  getTaxonomyEntry: getTaxonomyEntryMock,
  insertPendingTaxonomyEntry: insertPendingTaxonomyEntryMock,
  approveTaxonomyEntry: approveTaxonomyEntryMock,
  rejectTaxonomyEntry: rejectTaxonomyEntryMock,
  getPendingTaxonomyEntries: getPendingTaxonomyEntriesMock,
  getLocationCountByTaxonomy: getLocationCountByTaxonomyMock,
}));

mock.module("../../utils/location-utils", () => ({
  parseLocationValue: parseLocationValueMock,
}));

const { TaxonomyService } = await import("./taxonomy.service");

describe("TaxonomyService auto-approve behavior", () => {
  beforeEach(() => {
    getTaxonomyEntryMock.mockReset();
    insertPendingTaxonomyEntryMock.mockReset();
    approveTaxonomyEntryMock.mockReset();
    rejectTaxonomyEntryMock.mockReset();
    getPendingTaxonomyEntriesMock.mockReset();
    getLocationCountByTaxonomyMock.mockReset();
    parseLocationValueMock.mockReset();

    approveTaxonomyEntryMock.mockReturnValue(true);
    rejectTaxonomyEntryMock.mockReturnValue(true);
    getPendingTaxonomyEntriesMock.mockReturnValue([]);
    getLocationCountByTaxonomyMock.mockReturnValue(0);
    parseLocationValueMock.mockImplementation((locationKey: string) => {
      const [country, city, neighborhood] = locationKey.split("|");
      return {
        country,
        city: city || null,
        neighborhood: neighborhood || null,
        locationKey,
      };
    });
  });

  test("auto-approves a newly inserted taxonomy key", () => {
    getTaxonomyEntryMock.mockReturnValueOnce(null);
    insertPendingTaxonomyEntryMock.mockReturnValueOnce({
      id: 1,
      country: "peru",
      city: "lima",
      neighborhood: "miraflores",
      locationKey: "peru|lima|miraflores",
      status: "pending",
    });

    const service = new TaxonomyService();
    const result = service.ensureTaxonomyEntry("peru|lima|miraflores", {
      autoApprove: true,
    });

    expect(result).toBe(true);
    expect(insertPendingTaxonomyEntryMock).toHaveBeenCalledTimes(1);
    expect(approveTaxonomyEntryMock).toHaveBeenCalledTimes(1);
    expect(approveTaxonomyEntryMock).toHaveBeenCalledWith(
      "peru|lima|miraflores"
    );
  });

  test("auto-approves an existing pending taxonomy key", () => {
    getTaxonomyEntryMock.mockReturnValueOnce({
      id: 2,
      country: "peru",
      city: "lima",
      neighborhood: "san-isidro",
      locationKey: "peru|lima|san-isidro",
      status: "pending",
    });

    const service = new TaxonomyService();
    const result = service.ensureTaxonomyEntry("peru|lima|san-isidro", {
      autoApprove: true,
    });

    expect(result).toBe(true);
    expect(insertPendingTaxonomyEntryMock).not.toHaveBeenCalled();
    expect(approveTaxonomyEntryMock).toHaveBeenCalledTimes(1);
    expect(approveTaxonomyEntryMock).toHaveBeenCalledWith(
      "peru|lima|san-isidro"
    );
  });

  test("does not re-approve an already approved taxonomy key", () => {
    getTaxonomyEntryMock.mockReturnValueOnce({
      id: 3,
      country: "peru",
      city: "lima",
      neighborhood: "barranco",
      locationKey: "peru|lima|barranco",
      status: "approved",
    });

    const service = new TaxonomyService();
    const result = service.ensureTaxonomyEntry("peru|lima|barranco", {
      autoApprove: true,
    });

    expect(result).toBe(true);
    expect(insertPendingTaxonomyEntryMock).not.toHaveBeenCalled();
    expect(approveTaxonomyEntryMock).not.toHaveBeenCalled();
  });
});
