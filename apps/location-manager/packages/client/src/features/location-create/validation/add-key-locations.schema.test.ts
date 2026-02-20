import {
  addKeyLocationsSchema,
  addKeyLocationsSubmitSchema,
  buildKeyLocationsPrefillSignature,
} from "./add-key-locations.schema";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

const validBaseForm = {
  name: "Jorge Chavez International Airport",
  address: "Av. Elmer Faucett s/n, Callao",
  type: "airport",
  status: "active" as const,
  accessDetails: JSON.stringify({
    taxi: { available: true },
    rideshare: { pickup: "Door 3" },
    bus: { line: "Airport Express" },
  }),
  infoDetails: JSON.stringify({
    terminals: { total: 1 },
    airlines: ["LATAM", "Sky"],
    atm: { available: true },
  }),
  images: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=80",
  website: "https://www.lima-airport.com",
  phone: "+51 1 517-3100",
  tripadvisorUrl: "",
  googleUrl: "https://www.google.com/maps/place/test",
  placeId: "ChIJ123",
  latitude: "-12.0219",
  longitude: "-77.1143",
  locationKey: "peru|lima|callao",
  district: "Callao",
  ianaTimeId: "America/Lima",
  hours: JSON.stringify(
    {
      hours: [
        { day: "Sunday", hours: "00:00:00 - 23:59:59" },
        { day: "Monday", hours: "00:00:00 - 23:59:59" },
      ],
    },
    null,
    2
  ),
};

describe("add key locations schema", () => {
  test("accepts a valid staged key locations payload", () => {
    const result = addKeyLocationsSchema.safeParse(validBaseForm);
    expect(result.success).toBe(true);
  });

  test("rejects missing required dropdown fields", () => {
    const result = addKeyLocationsSchema.safeParse({
      ...validBaseForm,
      type: "",
      status: "unknown",
    });

    expect(result.success).toBe(false);
  });

  test("rejects invalid URL and coordinate fields", () => {
    const result = addKeyLocationsSchema.safeParse({
      ...validBaseForm,
      website: "not-a-url",
      latitude: "500",
      longitude: "-500",
    });

    expect(result.success).toBe(false);
  });

  test("rejects invalid JSON detail fields", () => {
    const result = addKeyLocationsSchema.safeParse({
      ...validBaseForm,
      accessDetails: "not-json",
      infoDetails: "{}[]",
    });

    expect(result.success).toBe(false);
  });
});

describe("add key locations submit schema prefill signature requirements", () => {
  test("rejects submit payload when prefill signature is missing", () => {
    const result = addKeyLocationsSubmitSchema.safeParse({
      prefillSignature: null,
      formValues: validBaseForm,
    });

    expect(result.success).toBe(false);
  });

  test("rejects submit payload when prefill signature is stale", () => {
    const result = addKeyLocationsSubmitSchema.safeParse({
      prefillSignature: buildKeyLocationsPrefillSignature("Old Name", "Old Address"),
      formValues: validBaseForm,
    });

    expect(result.success).toBe(false);
  });

  test("accepts submit payload when prefill signature matches current form values", () => {
    const result = addKeyLocationsSubmitSchema.safeParse({
      prefillSignature: buildKeyLocationsPrefillSignature(validBaseForm.name, validBaseForm.address),
      formValues: validBaseForm,
    });

    expect(result.success).toBe(true);
  });
});
