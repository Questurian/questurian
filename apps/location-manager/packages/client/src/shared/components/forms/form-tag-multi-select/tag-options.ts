import type {
  TagSelectGroup,
  TagSelectOption,
} from "../form-tag-multi-select.types";

export function buildTagOptionsView(
  options: readonly TagSelectOption[],
  optionGroups: readonly TagSelectGroup[] | undefined,
  selectedValues: string[]
) {
  const allOptions = optionGroups
    ? optionGroups.flatMap((group) => group.options)
    : options;
  const availableOptions = allOptions.filter(
    (option) => !selectedValues.includes(option.value)
  );
  const availableOptionGroups = optionGroups
    ?.map((group) => ({
      ...group,
      options: group.options.filter(
        (option) => !selectedValues.includes(option.value)
      ),
    }))
    .filter((group) => group.options.length > 0);

  return {
    allOptions,
    availableOptions,
    availableOptionGroups,
    optionLabelByValue: new Map(
      allOptions.map((option) => [option.value, option.label])
    ),
  };
}
