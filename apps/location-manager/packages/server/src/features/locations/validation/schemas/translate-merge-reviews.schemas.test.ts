import { describe, expect, test } from "bun:test";
import { parseTranslateMergeRequest } from "./translate-merge-reviews.schemas";

describe("translate merge request schema parsing", () => {
  test("defaults to both sources when sources are missing or invalid", () => {
    expect(parseTranslateMergeRequest({})).toEqual({
      ok: true,
      value: {
        includeGoogle: true,
        includeTripadvisor: true,
      },
    });

    expect(parseTranslateMergeRequest({ sources: "google" })).toEqual({
      ok: true,
      value: {
        includeGoogle: true,
        includeTripadvisor: true,
      },
    });
  });

  test("enables only requested valid sources", () => {
    expect(parseTranslateMergeRequest({ sources: ["GOOGLE", "custom"] })).toEqual({
      ok: true,
      value: {
        includeGoogle: true,
        includeTripadvisor: false,
      },
    });

    expect(parseTranslateMergeRequest({ sources: ["tripadvisor"] })).toEqual({
      ok: true,
      value: {
        includeGoogle: false,
        includeTripadvisor: true,
      },
    });
  });

  test("rejects payload when no supported sources are present", () => {
    expect(parseTranslateMergeRequest({ sources: ["foo", "bar"] })).toEqual({
      ok: false,
      error: "At least one source is required",
    });
  });
});
