import type { ReactNode } from "react";
import { Controller, type Control } from "react-hook-form";
import {
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui";
import type { FieldProvenance } from "@questurian/lm-shared";
import type { EditLocationFormData } from "../../validation/edit-location.schema";
import { DetailRow } from "../DetailLayout";

export function ControlledInputRow({
  label,
  name,
  control,
  provenance,
  description,
  placeholder,
}: {
  label: string;
  name: keyof EditLocationFormData;
  control: Control<EditLocationFormData>;
  provenance?: FieldProvenance;
  description?: string;
  placeholder?: string;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <DetailRow
          label={label}
          provenance={provenance}
          description={description}
          error={fieldState.error?.message}
        >
          <Input
            id={String(field.name)}
            value={(field.value as string | undefined) ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={placeholder}
            aria-invalid={fieldState.invalid}
            className="h-9"
          />
        </DetailRow>
      )}
    />
  );
}

export function ControlledTextareaRow({
  label,
  name,
  control,
  provenance,
  description,
  placeholder,
  rows = 4,
}: {
  label: string;
  name: keyof EditLocationFormData;
  control: Control<EditLocationFormData>;
  provenance?: FieldProvenance;
  description?: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <DetailRow
          label={label}
          provenance={provenance}
          description={description}
          error={fieldState.error?.message}
          multiline
        >
          <Textarea
            id={String(field.name)}
            value={(field.value as string | undefined) ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={placeholder}
            rows={rows}
            aria-invalid={fieldState.invalid}
          />
        </DetailRow>
      )}
    />
  );
}

export function ControlledSelectRow({
  label,
  name,
  control,
  provenance,
  placeholder,
  disabled,
  children,
}: {
  label: string;
  name: keyof EditLocationFormData;
  control: Control<EditLocationFormData>;
  provenance?: FieldProvenance;
  placeholder?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const stringValue = (field.value as string | undefined) ?? undefined;
        return (
          <DetailRow label={label} provenance={provenance} error={fieldState.error?.message}>
            {/*
              Radix Select doesn't pick up external value changes once it's been
              mounted as uncontrolled. Re-key on the current value so the Select
              remounts whenever a server-side update (pending-suggestion accept,
              poll refresh) changes the field's value out from under us.
            */}
            <Select
              key={`${name}-${stringValue ?? "unset"}`}
              value={stringValue}
              onValueChange={field.onChange}
              disabled={disabled}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>{children}</SelectContent>
            </Select>
          </DetailRow>
        );
      }}
    />
  );
}
