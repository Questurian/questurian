import { test, expect, describe } from "bun:test";
import { DistrictExtractionService } from "../district-extraction.service";
import type { AdministrativeLevel, InformativeLevel } from "@server/shared/services/external/bigdatacloud-api.client";

describe("DistrictExtractionService", () => {
  const service = new DistrictExtractionService();

  const mockPeruAdminData: AdministrativeLevel[] = [
    { name: "Peru", adminLevel: 1 },
    { name: "Lima", adminLevel: 4 },
    { name: "Miraflores", adminLevel: 8 },
  ];

  const mockColombiaAdminData: AdministrativeLevel[] = [
    { name: "Colombia", adminLevel: 1 },
    { name: "Bogota", adminLevel: 4 },
    { name: "Chapinero", adminLevel: 8 },
  ];

  const mockBrazilAdminData: AdministrativeLevel[] = [
    { name: "Brazil", adminLevel: 1 },
    { name: "Rio de Janeiro", adminLevel: 4 },
    { name: "Copacabana", adminLevel: 8 },
  ];

  test("extracts district for Peru at adminLevel 8", () => {
    const result = service.extractDistrict("PE", mockPeruAdminData);
    expect(result).toBe("Miraflores");
  });

  test("extracts district for Colombia at adminLevel 8", () => {
    const result = service.extractDistrict("CO", mockColombiaAdminData);
    expect(result).toBe("Chapinero");
  });

  test("extracts bairro for Brazil at adminLevel 8 when no informative data", () => {
    const result = service.extractDistrict("BR", mockBrazilAdminData);
    expect(result).toBe("Copacabana");
  });

  test("extracts Brazil tourism zone from informative array (Zona Sul)", () => {
    const mockInformative: InformativeLevel[] = [
      { name: "South Zone of Rio de Janeiro" },
      { name: "Rio de Janeiro" },
    ];
    const result = service.extractDistrict("BR", mockBrazilAdminData, mockInformative);
    expect(result).toBe("Zona Sul");
  });

  test("extracts Brazil tourism zone from informative array (Zona Norte)", () => {
    const mockInformative: InformativeLevel[] = [
      { name: "North Zone" },
    ];
    const result = service.extractDistrict("BR", mockBrazilAdminData, mockInformative);
    expect(result).toBe("Zona Norte");
  });

  test("extracts Brazil tourism zone from informative array (Centro)", () => {
    const mockInformative: InformativeLevel[] = [
      { name: "Centro" },
      { name: "Rio de Janeiro" },
    ];
    const result = service.extractDistrict("BR", mockBrazilAdminData, mockInformative);
    expect(result).toBe("Centro");
  });

  test("extracts Brazil tourism zone from informative array (Zona Oeste)", () => {
    const mockInformative: InformativeLevel[] = [
      { name: "West Zone of Rio de Janeiro" },
    ];
    const result = service.extractDistrict("BR", mockBrazilAdminData, mockInformative);
    expect(result).toBe("Zona Oeste");
  });

  test("extracts Brazil tourism zone from informative array (Ilhas)", () => {
    const mockInformative: InformativeLevel[] = [
      { name: "Ilhas" },
    ];
    const result = service.extractDistrict("BR", mockBrazilAdminData, mockInformative);
    expect(result).toBe("Ilhas");
  });

  test("falls back to bairro when Brazil informative has no zone match", () => {
    const mockInformative: InformativeLevel[] = [
      { name: "Some Other Info" },
      { name: "Not A Zone" },
    ];
    const result = service.extractDistrict("BR", mockBrazilAdminData, mockInformative);
    expect(result).toBe("Copacabana");
  });

  test("handles Brazil with empty informative array", () => {
    const result = service.extractDistrict("BR", mockBrazilAdminData, []);
    expect(result).toBe("Copacabana");
  });

  test("falls back to adminLevel 8 for unknown country", () => {
    const result = service.extractDistrict("XX", mockPeruAdminData);
    expect(result).toBe("Miraflores");
  });

  test("falls back to adminLevel 8 when countryCode is undefined", () => {
    const result = service.extractDistrict(undefined, mockPeruAdminData);
    expect(result).toBe("Miraflores");
  });

  test("returns null when no matching adminLevel found", () => {
    const emptyData: AdministrativeLevel[] = [
      { name: "Country", adminLevel: 1 },
      { name: "City", adminLevel: 4 },
    ];
    const result = service.extractDistrict("PE", emptyData);
    expect(result).toBe(null);
  });

  test("returns null when administrative array is empty", () => {
    const result = service.extractDistrict("PE", []);
    expect(result).toBe(null);
  });

  test("handles lowercase country codes", () => {
    const result = service.extractDistrict("pe", mockPeruAdminData);
    expect(result).toBe("Miraflores");
  });

  test("getAllMappings returns all configured countries", () => {
    const mappings = service.getAllMappings();
    expect(mappings).toHaveProperty("PE");
    expect(mappings).toHaveProperty("CO");
    expect(mappings).toHaveProperty("BR");
    expect(mappings["PE"]).toEqual([8]);
    expect(mappings["CO"]).toEqual([8]);
    expect(mappings["BR"]).toEqual([8]);
  });

  test("setCountryMapping allows adding new country", () => {
    service.setCountryMapping("CL", [7]);
    const mappings = service.getAllMappings();
    expect(mappings).toHaveProperty("CL");
    expect(mappings["CL"]).toEqual([7]);
  });

  test("setCountryMapping allows fallback chain", () => {
    service.setCountryMapping("AR", [6, 8]);
    const mappings = service.getAllMappings();
    expect(mappings["AR"]).toEqual([6, 8]);
  });
});
