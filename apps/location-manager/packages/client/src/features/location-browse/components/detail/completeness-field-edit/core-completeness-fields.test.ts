import type { LocationResponse, UpdateMapsRequest } from "@client/shared/services/api/types";
import { getCoreFieldConfig } from "./core-completeness-fields";
import type { SaveStrategyContext } from "./submission/save-strategy";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
};

const attractionsLocation = {
  id: "attraction-1",
  category: "attractions",
  attractionsDetails: {
    core: { attraction_type: "museum", pricing: "$$" },
    visit: { booking_required: false },
    contact: {
      website: "https://old.example.com",
      phone: "+15555550123",
      google_maps_url: "https://maps.example.com/place",
    },
  },
} as unknown as LocationResponse;

function saveBlankCoreField(fieldKey: string): UpdateMapsRequest {
  const config = getCoreFieldConfig(fieldKey);
  if (!config) throw new Error(`missing config for ${fieldKey}`);

  let payload: UpdateMapsRequest | undefined;
  const context = {
    field: { key: fieldKey, label: fieldKey, present: true },
    locationDetail: attractionsLocation,
    draft: { value: "", phoneNotAvailable: false },
    save: (data: UpdateMapsRequest) => {
      payload = data;
    },
    close: () => {},
    showValidationError: () => {},
  } as unknown as SaveStrategyContext;

  expect(config.saveStrategy.canSave(context)).toBe(true);
  config.saveStrategy.save(context);
  if (!payload) throw new Error(`no payload for ${fieldKey}`);
  return payload;
}

describe("optional attraction core field saves", () => {
  test("clears website from canonical and attraction detail storage", () => {
    const payload = saveBlankCoreField("website");
    const details = payload.attractionsDetails as Record<string, Record<string, unknown>>;

    expect(payload.website).toBe("");
    expect(details.contact.website).toBe(undefined);
    expect(details.contact.phone).toBe("+15555550123");
  });

  test("clears phone from canonical and attraction detail storage", () => {
    const payload = saveBlankCoreField("phone");
    const details = payload.attractionsDetails as Record<string, Record<string, unknown>>;

    expect(payload.phoneNumber).toBe("");
    expect(payload.phoneUnavailable).toBe(false);
    expect(details.contact.phone).toBe(undefined);
    expect(details.contact.website).toBe("https://old.example.com");
  });

  test("clears tickets URL with the server blank-string contract", () => {
    expect(saveBlankCoreField("bookingUrl")).toEqual({ bookingUrl: "" });
  });
});
