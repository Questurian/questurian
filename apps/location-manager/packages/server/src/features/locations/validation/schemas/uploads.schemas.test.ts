import { describe, expect, test } from "bun:test";
import {
  uploadIdParamsSchema,
  updateUploadPhotographerCreditBodySchema,
} from "./uploads.schemas";

describe("uploads schema validation", () => {
  test("rejects missing photographer credit body", () => {
    const result = updateUploadPhotographerCreditBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects whitespace-only photographer credit body", () => {
    const result = updateUploadPhotographerCreditBodySchema.safeParse({
      photographerCredit: "   ",
    });
    expect(result.success).toBe(false);
  });

  test("accepts photographer credit body and trims it", () => {
    const result = updateUploadPhotographerCreditBodySchema.safeParse({
      photographerCredit: "  Jane Doe  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.photographerCredit).toBe("Jane Doe");
    }
  });

  test("upload id params require numeric id", () => {
    const bad = uploadIdParamsSchema.safeParse({ id: "abc" });
    expect(bad.success).toBe(false);

    const good = uploadIdParamsSchema.safeParse({ id: "123" });
    expect(good.success).toBe(true);
  });
});
