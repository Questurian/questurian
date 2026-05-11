import { describe, expect, test } from "bun:test";
import { editLocationSchema } from "./edit-location.schema";

describe("edit location schema dining urls", () => {
  test("accepts valid menu and reservation urls", () => {
    const result = editLocationSchema.safeParse({
      menuUrl: "https://example.com/menu",
      reservationUrl: "https://example.com/reserve",
    });

    expect(result.success).toBe(true);
  });

  test("rejects invalid menu and reservation urls", () => {
    const result = editLocationSchema.safeParse({
      menuUrl: "not-a-url",
      reservationUrl: "also-not-a-url",
    });

    expect(result.success).toBe(false);
  });
});
