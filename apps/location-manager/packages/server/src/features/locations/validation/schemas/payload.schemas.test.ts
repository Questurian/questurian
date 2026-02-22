import { describe, expect, test } from "bun:test";
import { syncAllSchema } from "./payload.schemas";

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
