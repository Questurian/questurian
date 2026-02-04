import { type Control, type FieldValues, type Path } from "react-hook-form";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui";
import { FormBase } from "./form-base";

export interface TagSelectOption {
  value: string;
  label: string;
}

export interface FormTagMultiSelectProps<T extends FieldValues = FieldValues> {
  name: Path<T>;
  label: string;
  control: Control<T>;
  options: readonly TagSelectOption[];
  maxSelections?: number;
  placeholder?: string;
  description?: string;
}

export function FormTagMultiSelect<T extends FieldValues = FieldValues>({
  name,
  label,
  control,
  options,
  maxSelections = 4,
  placeholder = "Select a tag",
  description,
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
        const availableOptions = options.filter(
          (option) => !selectedValues.includes(option.value)
        );
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
            <Select
              key={selectedValues.join("|") || "empty"}
              value={undefined}
              onValueChange={addTag}
              disabled={availableOptions.length === 0 || isAtLimit}
            >
              <SelectTrigger
                id={field.name}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid}
              >
                <SelectValue
                  placeholder={
                    isAtLimit
                      ? `Maximum ${maxSelections} tags selected`
                      : placeholder
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedValues.map((value) => (
                  <span
                    key={value}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground"
                  >
                    {value}
                    <button
                      type="button"
                      className="rounded-sm text-muted-foreground hover:text-foreground"
                      onClick={() => removeTag(value)}
                      aria-label={`Remove ${value}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {selectedValues.length}/{maxSelections} selected
            </p>
          </div>
        );
      }}
    </FormBase>
  );
}
