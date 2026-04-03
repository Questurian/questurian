import { NO_MUSIC_VALUE } from "@client/shared/constants/nightlife-options";

export function toggleNightlifeMusicSelection(
  currentValues: string[],
  selectedValue: string
): string[] {
  if (selectedValue === NO_MUSIC_VALUE) {
    return currentValues.includes(NO_MUSIC_VALUE) ? [] : [NO_MUSIC_VALUE];
  }

  const withoutNoMusic = currentValues.filter((value) => value !== NO_MUSIC_VALUE);

  return withoutNoMusic.includes(selectedValue)
    ? withoutNoMusic.filter((value) => value !== selectedValue)
    : [...withoutNoMusic, selectedValue];
}
