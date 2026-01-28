import * as React from "react";
import { type Control, type FieldValues, type Path } from "react-hook-form";
import { Select, SelectTrigger, SelectValue, SelectContent } from "@client/components/ui";
import { FormBase } from "./form-base";

export interface FormSelectProps<T extends FieldValues = FieldValues> {
  name: Path<T>;
  label: string;
  control: Control<T>;
  children: React.ReactNode;
  placeholder?: string;
  description?: string;
}

export function FormSelect<T extends FieldValues = FieldValues>({
  name,
  label,
  control,
  children,
  placeholder,
  description,
}: FormSelectProps<T>) {
  return (
    <FormBase
      name={name}
      label={label}
      control={control}
      description={description}
    >
      {(field, fieldState) => {
        const { onChange, onBlur, value, ref, ...fieldRest } = field;

        console.log(`🔍 FormSelect[${name}] - value:`, value, typeof value);

        return (
          <Select
            key={`${name}-${value || 'unset'}`}
            {...fieldRest}
            value={value ?? undefined}
            onValueChange={onChange}
            aria-invalid={fieldState.invalid}
          >
            <SelectTrigger id={field.name} onBlur={onBlur} ref={ref}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {children}
            </SelectContent>
          </Select>
        );
      }}
    </FormBase>
  );
}
