import {
  addAccommodationsSchema,
  addAccommodationsSubmitSchema,
  buildAccommodationsPrefillSignature,
} from "./add-accommodations.schema";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

const validBaseForm = {
  name: "The Meridian Grand",
  title: "",
  address: "220 Market Street, Financial District",
  type: "hotel",
  price: "$$$$",
  perfectFor: ["Solo", "Couples"],
  kidFriendly: "yes",
  ac: "yes",
  wifi: "yes",
  extraGuestFee: "no",
  parking: ["onsite", "valet"],
  breakfastServed: "yes",
  vibe: ["Luxury", "Social"],
  workspace: ["Dedicated Desk"],
  restaurant: "yes",
  pool: ["indoor", "rooftop"],
  rooftopLounge: "yes",
  jacuzzi: ["private", "rooftop"],
  gym: "24/7",
  walkability: "Walkable Downtown",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  phone: "+1 (555) 700-1200",
  websiteUrl: "https://example.com/meridian-grand",
  bookingUrl: "https://example.com/meridian-grand/book",
  googleMapsUrl: "https://maps.google.com/?q=220+Market+Street+Miami",
  googleUrl: "https://www.google.com/maps/place/test",
  placeId: "ChIJ123",
  latitude: "25.7743",
  longitude: "-80.1937",
  locationKey: "united-states|miami|financial-district",
  district: "Financial District",
  ianaTimeId: "America/New_York",
};

describe("add accommodations schema", () => {
  test("accepts a valid staged accommodations payload", () => {
    const result = addAccommodationsSchema.safeParse(validBaseForm);
    expect(result.success).toBe(true);
  });

  test("rejects invalid URL/time fields", () => {
    const result = addAccommodationsSchema.safeParse({
      ...validBaseForm,
      websiteUrl: "not-a-url",
      bookingUrl: "bad-url",
      checkInTime: "25:00",
    });

    expect(result.success).toBe(false);
  });

  test("rejects missing required entity fields", () => {
    const result = addAccommodationsSchema.safeParse({
      ...validBaseForm,
      placeId: "",
      latitude: "",
      longitude: "",
    });

    expect(result.success).toBe(false);
  });

  test("rejects empty required multi-select fields", () => {
    const result = addAccommodationsSchema.safeParse({
      ...validBaseForm,
      perfectFor: [],
      parking: [],
      vibe: [],
      pool: [],
      jacuzzi: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("add accommodations submit schema prefill signature requirements", () => {
  test("rejects submit payload when prefill signature is missing", () => {
    const result = addAccommodationsSubmitSchema.safeParse({
      prefillSignature: null,
      formValues: validBaseForm,
    });

    expect(result.success).toBe(false);
  });

  test("rejects submit payload when prefill signature is stale", () => {
    const result = addAccommodationsSubmitSchema.safeParse({
      prefillSignature: buildAccommodationsPrefillSignature("Old Name", "Old Address"),
      formValues: validBaseForm,
    });

    expect(result.success).toBe(false);
  });

  test("accepts submit payload when prefill signature matches current form values", () => {
    const result = addAccommodationsSubmitSchema.safeParse({
      prefillSignature: buildAccommodationsPrefillSignature(validBaseForm.name, validBaseForm.address),
      formValues: validBaseForm,
    });

    expect(result.success).toBe(true);
  });
});
