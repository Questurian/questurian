import { describe, expect, test } from "bun:test";
import { payloadMediaSetsQuerySchema, syncAllSchema } from "./payload.schemas";

describe("payload sync category schema", () => {
  test("accepts payload-supported category filters", () => {
    const result = syncAllSchema.safeParse({ category: "dining" });
    expect(result.success).toBe(true);
  });

  test("accepts key_locations category filter", () => {
    const result = syncAllSchema.safeParse({ category: "key_locations" });
    expect(result.success).toBe(true);
  });
});

describe("payload media sets query schema", () => {
  test("parses comma-separated ids and numeric pagination", () => {
    const result = payloadMediaSetsQuerySchema.safeParse({
      query: " museum ",
      page: "2",
      limit: "12",
      ids: "media-1, media-2,media-3",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toEqual({
      query: "museum",
      page: 2,
      limit: 12,
      ids: ["media-1", "media-2", "media-3"],
    });
  });

  test("allows empty query params to collapse to undefined", () => {
    const result = payloadMediaSetsQuerySchema.safeParse({
      query: "   ",
      ids: "",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.query).toBeUndefined();
    expect(result.data.ids).toBeUndefined();
  });
});
