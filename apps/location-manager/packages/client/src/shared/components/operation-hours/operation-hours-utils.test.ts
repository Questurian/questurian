import { describe, expect, test } from "bun:test";
import {
  buildOperationHoursJson,
  buildOperationHoursSummary,
  createClosedDayEntries,
  createOpen24HoursDayEntries,
  isOpen24Hours,
  parseOperationHoursJson,
} from "./operation-hours-utils";

describe("operation hours", () => {
  test("serializes Open 24/7 using canonical seven-day rows", () => {
    const json = buildOperationHoursJson(createOpen24HoursDayEntries());
    const parsed = JSON.parse(json) as { hours: Array<{ day: string; hours: string }> };

    expect(parsed.hours.length).toBe(7);
    expect(parsed.hours.every((row) => row.hours === "00:00:00 - 23:59:59")).toBe(true);
    expect(isOpen24Hours(parseOperationHoursJson(json))).toBe(true);
    expect(buildOperationHoursSummary(json)).toBe("Open 24/7");
  });

  test("does not mistake a custom schedule for Open 24/7", () => {
    const entries = createClosedDayEntries();
    entries[1] = {
      day: "Monday",
      closed: false,
      slots: [{ open: "09:00", close: "17:00" }],
    };

    expect(isOpen24Hours(entries)).toBe(false);
  });
});
