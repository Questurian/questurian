export function optionValueMatchesDefault(value: unknown, defaultValue: unknown) {
  if (Array.isArray(defaultValue) && Array.isArray(value)) {
    return defaultValue.length === value.length && defaultValue.every((item) => value.includes(item));
  }
  return value === defaultValue;
}

export function optionValueIsEmpty(value: unknown) {
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "string" ? value.trim().length === 0 : false;
}

export function isAccommodationOptionSuggestionEligible(input: {
  value: unknown;
  defaultValue: unknown;
  isPrefillReady: boolean;
  optionsCount: number;
  isDirty: boolean;
  isApiFilled: boolean;
  isAiSuggested: boolean;
}) {
  const isMissingOrDefault =
    optionValueIsEmpty(input.value) ||
    optionValueMatchesDefault(input.value, input.defaultValue);

  return (
    input.isPrefillReady &&
    input.optionsCount > 0 &&
    !input.isDirty &&
    !input.isApiFilled &&
    !input.isAiSuggested &&
    isMissingOrDefault
  );
}
