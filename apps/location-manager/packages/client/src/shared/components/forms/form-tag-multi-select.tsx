import type { FieldValues } from "react-hook-form";
import { FormBase } from "./form-base";
import { DirectTagArrayInput } from "./form-tag-multi-select/DirectTagArrayInput";
import { SelectedTagChips } from "./form-tag-multi-select/SelectedTagChips";
import { TagSelectMenu } from "./form-tag-multi-select/TagSelectMenu";
import { buildTagOptionsView } from "./form-tag-multi-select/tag-options";
import type { FormTagMultiSelectProps } from "./form-tag-multi-select.types";

export type {
  FormTagMultiSelectProps,
  TagSelectGroup,
  TagSelectOption,
} from "./form-tag-multi-select.types";

export function FormTagMultiSelect<T extends FieldValues = FieldValues>({
  name,
  label,
  control,
  options = [],
  optionGroups,
  maxSelections = 4,
  placeholder = "Select a tag",
  description,
  allowDirectTagArrayInput = false,
}: FormTagMultiSelectProps<T>) {
  return (
    <FormBase
      name={name}
      label={label}
      control={control}
      description={description}
    >
      {(field, fieldState) => {
        const selectedValues = Array.isArray(field.value)
          ? (field.value as string[])
          : [];
        const {
          allOptions,
          availableOptions,
          availableOptionGroups,
          optionLabelByValue,
        } = buildTagOptionsView(options, optionGroups, selectedValues);
        const isAtLimit = selectedValues.length >= maxSelections;

        const addTag = (nextValue: string) => {
          if (selectedValues.includes(nextValue) || isAtLimit) return;
          field.onChange([...selectedValues, nextValue]);
        };
        const removeTag = (valueToRemove: string) => {
          field.onChange(
            selectedValues.filter((value) => value !== valueToRemove)
          );
        };

        return (
          <div className="space-y-2">
            <TagSelectMenu
              fieldName={field.name}
              selectedValues={selectedValues}
              availableOptions={availableOptions}
              availableOptionGroups={availableOptionGroups}
              usesOptionGroups={Boolean(optionGroups)}
              isAtLimit={isAtLimit}
              maxSelections={maxSelections}
              placeholder={placeholder}
              isInvalid={fieldState.invalid}
              onBlur={field.onBlur}
              onAdd={addTag}
            />

            {allowDirectTagArrayInput && (
              <DirectTagArrayInput
                selectedValues={selectedValues}
                options={allOptions}
                maxSelections={maxSelections}
                onApply={field.onChange}
              />
            )}

            <SelectedTagChips
              selectedValues={selectedValues}
              optionLabelByValue={optionLabelByValue}
              onRemove={removeTag}
            />

            <p className="text-xs text-muted-foreground">
              {selectedValues.length}/{maxSelections} selected
            </p>
          </div>
        );
      }}
    </FormBase>
  );
}
