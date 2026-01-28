import * as React from "react";
import { type Control, type FieldValues, type Path } from "react-hook-form";
import { Textarea } from "@client/components/ui";
import { FormBase } from "./form-base";

export interface FormTextareaProps<T extends FieldValues = FieldValues> extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  name: Path<T>;
  label: string;
  control: Control<T>;
  description?: string;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onInput?: (event: React.FormEvent<HTMLTextAreaElement>) => void;
}

export function FormTextarea<T extends FieldValues = FieldValues>({
  name,
  label,
  control,
  description,
  onPaste,
  onInput,
  ...textareaProps
}: FormTextareaProps<T>) {
  return (
    <FormBase
      name={name}
      label={label}
      control={control}
      description={description}
    >
      {(field, fieldState) => (
        <Textarea
          id={field.name}
          {...field}
          {...textareaProps}
          onPaste={onPaste}
          onInput={onInput}
          aria-invalid={fieldState.invalid}
        />
      )}
    </FormBase>
  );
}






