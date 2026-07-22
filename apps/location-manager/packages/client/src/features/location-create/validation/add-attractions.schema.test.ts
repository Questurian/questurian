import {
  addAttractionsSchema,
  addAttractionsSubmitSchema,
  buildAttractionsPrefillSignature,
} from "./add-attractions.schema";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

const validBaseForm = {
  name: "Larco Museum",
  address: "Av. Simón Bolívar 1515, Pueblo Libre, Lima",
  type: "museum",
  priceLevel: "$$",
  bookingRequired: "no",
  website: "https://example.com/larco-museum",
  phone: "+51 1 461-1312",
  tripadvisorUrl: "",
  googleUrl: "https://www.google.com/maps/place/test",
  placeId: "ChIJ123",
  latitude: "-12.0718",
  longitude: "-77.0708",
  locationKey: "peru|lima|pueblo-libre",
  district: "Pueblo Libre",
  ianaTimeId: "America/Lima",
  hours: JSON.stringify(
    {
      hours: [
        { day: "Sunday", hours: "09:00:00 - 22:00:00" },
        { day: "Monday", hours: "09:00:00 - 22:00:00" },
      ],
    },
    null,
    2
  ),
  tourIds: [],
};

describe("add attractions schema", () => {
  test("accepts a valid staged attractions payload", () => {
    const result = addAttractionsSchema.safeParse(validBaseForm);
    expect(result.success).toBe(true);
  });

  test("accepts a staged attractions payload without a website", () => {
    const result = addAttractionsSchema.safeParse({
      ...validBaseForm,
      website: "",
    });
    expect(result.success).toBe(true);
  });

  test("accepts a staged attractions payload without pricing or phone", () => {
    const result = addAttractionsSchema.safeParse({
      ...validBaseForm,
      priceLevel: "",
      phone: "",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing required fields", () => {
    const result = addAttractionsSchema.safeParse({
      ...validBaseForm,
      name: "",
      type: "",
      placeId: "",
    });

    expect(result.success).toBe(false);
  });

  test("rejects invalid URL and coordinate fields", () => {
    const result = addAttractionsSchema.safeParse({
      ...validBaseForm,
      website: "not-a-url",
      latitude: "500",
      longitude: "-500",
    });

    expect(result.success).toBe(false);
  });

  test("rejects non-JSON hours values", () => {
    const result = addAttractionsSchema.safeParse({
      ...validBaseForm,
      hours: "Open 24 hours",
    });

    expect(result.success).toBe(false);
  });
});

describe("add attractions submit schema prefill signature requirements", () => {
  test("rejects submit payload when prefill signature is missing", () => {
    const result = addAttractionsSubmitSchema.safeParse({
      prefillSignature: null,
      formValues: validBaseForm,
    });

    expect(result.success).toBe(false);
  });

  test("rejects submit payload when prefill signature is stale", () => {
    const result = addAttractionsSubmitSchema.safeParse({
      prefillSignature: buildAttractionsPrefillSignature("Old Name", "Old Address"),
      formValues: validBaseForm,
    });

    expect(result.success).toBe(false);
  });

  test("accepts submit payload when prefill signature matches current form values", () => {
    const result = addAttractionsSubmitSchema.safeParse({
      prefillSignature: buildAttractionsPrefillSignature(validBaseForm.name, validBaseForm.address),
      formValues: validBaseForm,
    });

    expect(result.success).toBe(true);
  });
});
