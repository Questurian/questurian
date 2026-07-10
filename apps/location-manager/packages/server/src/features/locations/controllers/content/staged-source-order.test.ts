import { describe, expect, test } from "bun:test";
import { orderStagedSourceSnapshots, type StagedSourceSnapshot } from "@questurian/lm-shared";

const source = (values: Partial<StagedSourceSnapshot> & Pick<StagedSourceSnapshot, "uploadId" | "origin">): StagedSourceSnapshot => ({
  googlePhotoName: null,
  instagramEmbedId: null,
  instagramMediaKey: null,
  sourcePosition: null,
  sourceUrl: null,
  stagedSourceStatus: "ready",
  errorMessage: null,
  hasSource: true,
  hasVariants: false,
  sourcePath: "source.webp",
  altText: null,
  photographerCredit: "Place",
  ...values,
});

describe("orderStagedSourceSnapshots", () => {
  test("keeps each Instagram carousel grouped in source order", () => {
    const ordered = orderStagedSourceSnapshots([
      source({ uploadId: 12, origin: "instagram", instagramEmbedId: 5, sourcePosition: 1 }),
      source({ uploadId: 50, origin: "google" }),
      source({ uploadId: 13, origin: "instagram", instagramEmbedId: 6, sourcePosition: 0 }),
      source({ uploadId: 11, origin: "instagram", instagramEmbedId: 5, sourcePosition: 0 }),
    ]);

    expect(ordered.map((item) => item.uploadId)).toEqual([13, 11, 12, 50]);
  });
});
