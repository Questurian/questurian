import { describe, expect, test } from "bun:test";
import { buildAttractionsDetails } from "./attractions-details";

describe("buildAttractionsDetails", () => {
  test("omits optional pricing when unspecified", () => {
    const details = buildAttractionsDetails({
      type: "museum",
      locationKey: "peru|lima|pueblo-libre",
      hours: {
        hours: [{ day: "Monday", hours: "09:00:00 - 17:00:00" }],
      },
      bookingRequired: false,
    });

    expect("pricing" in details.core).toBe(false);
  });
});
