import { describe, expect, test } from "bun:test";
import { NotFoundError } from "@shared/errors/http-error";
import { PayloadCollectionResolver } from "./payload-collection.resolver";

describe("PayloadCollectionResolver", () => {
  test("maps the local key_locations category to Payload's collection slug", () => {
    const resolver = new PayloadCollectionResolver({
      getLocationById: () => ({ category: "key_locations" }),
    } as never);

    expect(resolver.forLocation(42)).toBe("key-locations");
  });

  test("reports a missing location before sync state is written", () => {
    const resolver = new PayloadCollectionResolver({
      getLocationById: () => null,
    } as never);

    expect(() => resolver.forLocation(404)).toThrow(NotFoundError);
  });
});
