import {
  addRestaurantSchema,
  addRestaurantSubmitSchema,
  buildRestaurantPrefillSignature,
} from "./add-restaurant.schema";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

const validBaseForm = {
  name: "Test Restaurant",
  address: "123 Main St, Lima",
  type: "fine-dining",
  idealFor: ["Date Nights"],
  tripadvisorUrl: "",
  menuUrl: "",
  reservationUrl: "",
  googleUrl: "https://www.google.com/maps/place/test",
  placeId: "ChIJ123",
  latitude: "-12.0464",
  longitude: "-77.0428",
  locationKey: "peru|lima|miraflores",
  district: "Miraflores",
  ianaTimeId: "America/Lima",
};

describe("add restaurant schema", () => {
  test("accepts a valid staged restaurant payload", () => {
    const result = addRestaurantSchema.safeParse(validBaseForm);
    expect(result.success).toBe(true);
  });

  test("rejects missing required fields", () => {
    const result = addRestaurantSchema.safeParse({
      ...validBaseForm,
      name: "",
      address: "",
      placeId: "",
    });

    expect(result.success).toBe(false);
  });

  test("rejects invalid URL and coordinate fields", () => {
    const result = addRestaurantSchema.safeParse({
      ...validBaseForm,
      tripadvisorUrl: "not-a-url",
      menuUrl: "not-a-url",
      reservationUrl: "not-a-url",
      latitude: "500",
      longitude: "-500",
    });

    expect(result.success).toBe(false);
  });

  test("accepts valid optional menu and reservation URLs", () => {
    const result = addRestaurantSchema.safeParse({
      ...validBaseForm,
      menuUrl: "https://example.com/menu",
      reservationUrl: "https://example.com/reserve",
    });

    expect(result.success).toBe(true);
  });
});

describe("add restaurant submit schema prefill signature requirements", () => {
  test("rejects submit payload when prefill signature is missing", () => {
    const result = addRestaurantSubmitSchema.safeParse({
      prefillSignature: null,
      formValues: validBaseForm,
    });

    expect(result.success).toBe(false);
  });

  test("rejects submit payload when prefill signature is stale", () => {
    const result = addRestaurantSubmitSchema.safeParse({
      prefillSignature: buildRestaurantPrefillSignature("Old Name", "Old Address"),
      formValues: validBaseForm,
    });

    expect(result.success).toBe(false);
  });

  test("accepts submit payload when prefill signature matches current form values", () => {
    const result = addRestaurantSubmitSchema.safeParse({
      prefillSignature: buildRestaurantPrefillSignature(validBaseForm.name, validBaseForm.address),
      formValues: validBaseForm,
    });

    expect(result.success).toBe(true);
  });
});
