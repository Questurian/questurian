import { describe, expect, test } from "bun:test";
import { generateGoogleMapsUrl } from "../google/maps-url.utils";
import { normalizeGoogleOpeningHours } from "../google/opening-hours.utils";
import { slugifyLocationPart } from "../location-key.utils";

describe("geocoding utilities", () => {
  test("slugifies location key parts", () => {
    expect(slugifyLocationPart(" Roma Norte ")).toBe("roma-norte");
    expect(slugifyLocationPart("")).toBeNull();
  });

  test("generates an encoded Google Maps search URL", () => {
    expect(generateGoogleMapsUrl("Museo Larco", "Lima, Peru")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Museo%20Larco%2C%20Lima%2C%20Peru"
    );
  });

  test("splits overnight Google opening hours across days", () => {
    expect(normalizeGoogleOpeningHours({
      periods: [{ open: { day: 1, time: "2200" }, close: { day: 2, time: "0200" } }],
    })).toEqual({
      hours: [
        { day: "Sunday", hours: "Closed" },
        { day: "Monday", hours: "22:00:00 - 23:59:59" },
        { day: "Tuesday", hours: "00:00:00 - 02:00:00" },
        { day: "Wednesday", hours: "Closed" },
        { day: "Thursday", hours: "Closed" },
        { day: "Friday", hours: "Closed" },
        { day: "Saturday", hours: "Closed" },
      ],
    });
  });

  test("falls back to weekday text when periods are unavailable", () => {
    expect(normalizeGoogleOpeningHours({
      weekday_text: ["Monday: 9:00 AM - 5:30 PM", "Tuesday: Open 24 hours"],
    })?.hours.slice(1, 3)).toEqual([
      { day: "Monday", hours: "09:00:00 - 17:30:00" },
      { day: "Tuesday", hours: "00:00:00 - 23:59:59" },
    ]);
  });
});
