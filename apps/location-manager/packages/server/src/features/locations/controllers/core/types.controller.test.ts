import { describe, expect, test } from "bun:test";
import { getKeyLocationsTypes } from "./types.controller";

type TypeOptionsResponse = {
  options: Array<{ label: string; value: string }>;
};

describe("getKeyLocationsTypes", () => {
  test("returns expanded options for travel, remote work, and city setup needs", () => {
    const response = getKeyLocationsTypes({
      json: (payload: TypeOptionsResponse) => payload,
    } as never) as unknown as TypeOptionsResponse;

    const labelsByValue = new Map(
      response.options.map((option) => [option.value, option.label])
    );

    expect(response.options.length).toBeGreaterThan(20);
    expect(labelsByValue.get("airport")).toBe("Airport");
    expect(labelsByValue.get("embassy")).toBe("Embassy");
    expect(labelsByValue.get("grocery_store")).toBe("Grocery Store");
    expect(labelsByValue.get("hospital")).toBe("Hospital");
    expect(labelsByValue.get("doctor_office")).toBe("Doctor's Office");
    expect(labelsByValue.get("school")).toBe("School");
    expect(labelsByValue.get("coworking_space")).toBe("Coworking Space");
    expect(labelsByValue.get("immigration_office")).toBe("Immigration Office");
  });
});
