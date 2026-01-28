import * as React from "react";
import { type Control, type FieldValues, type Path } from "react-hook-form";
import { Input } from "@client/components/ui";
import { FormBase } from "./form-base";

export interface FormInputProps<T extends FieldValues = FieldValues> extends React.InputHTMLAttributes<HTMLInputElement> {
  name: Path<T>;
  label: string;
  control: Control<T>;
  description?: string;
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  onInput?: (event: React.FormEvent<HTMLInputElement>) => void;
}

export function FormInput<T extends FieldValues = FieldValues>({
  name,
  label,
  control,
  description,
  onPaste,
  onInput,
  ...inputProps
}: FormInputProps<T>) {
  return (
    <FormBase
      name={name}
      label={label}
      control={control}
      description={description}
    >
      {(field, fieldState) => (
        <Input
          id={field.name}
          {...field}
          {...inputProps}
          onPaste={onPaste}
          onInput={onInput}
          aria-invalid={fieldState.invalid}
        />
      )}
    </FormBase>
  );
}
