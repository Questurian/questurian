import * as React from "react";
import { Controller, type Control, type ControllerRenderProps, type ControllerFieldState, type FieldValues, type Path } from "react-hook-form";
import { Field, FieldLabel, FieldDescription, FieldError, FieldContent } from "../ui/field";

export interface FormBaseProps<T extends FieldValues = FieldValues> {
  name: Path<T>;
  label: string;
  control: Control<T>;
  children: (field: ControllerRenderProps<T, Path<T>>, fieldState: ControllerFieldState) => React.ReactNode;
  description?: string;
  orientation?: "vertical" | "horizontal";
  controlFirst?: boolean;
}

export function FormBase<T extends FieldValues = FieldValues>({
  name,
  label,
  control,
  children,
  description,
  orientation = "vertical",
  controlFirst = false,
}: FormBaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const isInvalid = fieldState.invalid;

        return (
          <Field data-invalid={isInvalid} orientation={orientation}>
            {controlFirst && children(field, fieldState)}

            {description ? (
              <FieldContent>
                <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
                <FieldDescription>{description}</FieldDescription>
              </FieldContent>
            ) : (
              <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
            )}

            {!controlFirst && children(field, fieldState)}

            {isInvalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        );
      }}
    />
  );
}
