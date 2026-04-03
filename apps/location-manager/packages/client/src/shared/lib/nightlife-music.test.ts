import { NO_MUSIC_VALUE } from "@client/shared/constants/nightlife-options";
import { toggleNightlifeMusicSelection } from "./nightlife-music";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toEqual: (expected: unknown) => void;
};

describe("toggleNightlifeMusicSelection", () => {
  test("selecting no music clears all other music selections", () => {
    expect(toggleNightlifeMusicSelection(["House", "EDM"], NO_MUSIC_VALUE)).toEqual([
      NO_MUSIC_VALUE,
    ]);
  });

  test("selecting a music genre removes the no music state", () => {
    expect(toggleNightlifeMusicSelection([NO_MUSIC_VALUE], "Vinyl-Driven Ambience")).toEqual([
      "Vinyl-Driven Ambience",
    ]);
  });

  test("toggling an existing music genre removes only that selection", () => {
    expect(
      toggleNightlifeMusicSelection(["House", "Vinyl-Driven Ambience"], "House")
    ).toEqual(["Vinyl-Driven Ambience"]);
  });
});
