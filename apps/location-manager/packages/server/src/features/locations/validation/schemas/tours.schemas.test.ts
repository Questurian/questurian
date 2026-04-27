import { describe, expect, test } from "bun:test";
import {
  createTourSchema,
  listToursQuerySchema,
  updateTourSchema,
} from "./tours.schemas";

describe("tour schemas", () => {
  test("accepts a valid tour create payload", () => {
    const result = createTourSchema.safeParse({
      title: "Sacred Valley Day Tour",
      imgPayloadMediaSetId: "media-set-1",
      bookingLink: "https://example.com/book",
      price: "From $80",
    });

    expect(result.success).toBe(true);
  });

  test("rejects missing image and invalid booking link", () => {
    const result = createTourSchema.safeParse({
      title: "Sacred Valley Day Tour",
      imgPayloadMediaSetId: "",
      bookingLink: "not-a-url",
      price: "From $80",
    });

    expect(result.success).toBe(false);
  });

  test("requires at least one field for updates", () => {
    expect(updateTourSchema.safeParse({}).success).toBe(false);
    expect(updateTourSchema.safeParse({ price: "$49" }).success).toBe(true);
  });

  test("normalizes list query ids", () => {
    const result = listToursQuerySchema.safeParse({
      ids: "1, 2, 2, nope, 3",
      limit: "25",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ids).toEqual([1, 2, 3]);
      expect(result.data.limit).toBe(25);
    }
  });
});
