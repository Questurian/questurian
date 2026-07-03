import {
  buildCenterCropStates,
  getFileNameFromPath,
  toImageApiPath,
} from "./photoImportPanel.utils";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
};

describe("photo import panel utilities", () => {
  test("normalizes server image paths to image API paths", () => {
    expect(toImageApiPath("data/images/photo.webp")).toBe("/api/images/photo.webp");
    expect(toImageApiPath("/packages/server/data/images/nested/photo.webp")).toBe(
      "/api/images/nested/photo.webp"
    );
    expect(toImageApiPath("apps\\location-manager\\packages\\server\\data\\images\\photo.webp")).toBe(
      "/api/images/photo.webp"
    );
  });

  test("reads file names from normalized paths with a fallback", () => {
    expect(getFileNameFromPath("nested/photo.webp", "fallback.webp")).toBe("photo.webp");
    expect(getFileNameFromPath("", "fallback.webp")).toBe("fallback.webp");
  });

  test("builds centered crop rectangles for every media variant", () => {
    const states = buildCenterCropStates(1600, 900);

    expect(Object.keys(states).length).toBe(7);
    expect(states.wide.croppedAreaPixels).toEqual({
      x: 0,
      y: 0,
      width: 1600,
      height: 900,
    });
    expect(states.square.croppedAreaPixels).toEqual({
      x: 350,
      y: 0,
      width: 900,
      height: 900,
    });
  });
});
