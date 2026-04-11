import { describe, expect, test } from "bun:test";
import { previewCorrectedLocationKey } from "./bulk.utils";

describe("previewCorrectedLocationKey", () => {
  test("neighborhood: renames last segment only when three-part (lima duplicate city+barrio)", () => {
    expect(
      previewCorrectedLocationKey(
        "peru|lima|lima",
        "lima",
        "lima-centro",
        "neighborhood"
      )
    ).toBe("peru|lima|lima-centro");
  });

  test("neighborhood: three-part other city", () => {
    expect(
      previewCorrectedLocationKey(
        "peru|cusco|lima",
        "lima",
        "lima-centro",
        "neighborhood"
      )
    ).toBe("peru|cusco|lima-centro");
  });

  test("neighborhood: two-part key unchanged (city lima, no barrio)", () => {
    expect(
      previewCorrectedLocationKey(
        "peru|lima",
        "lima",
        "lima-centro",
        "neighborhood"
      )
    ).toBe("peru|lima");
  });

  test("neighborhood: no match when last segment differs", () => {
    expect(
      previewCorrectedLocationKey(
        "peru|lima|miraflores",
        "lima",
        "lima-centro",
        "neighborhood"
      )
    ).toBe("peru|lima|miraflores");
  });

  test("country: first-occurrence replace for preview", () => {
    expect(
      previewCorrectedLocationKey("old|x|y", "old", "new", "country")
    ).toBe("new|x|y");
  });
});
