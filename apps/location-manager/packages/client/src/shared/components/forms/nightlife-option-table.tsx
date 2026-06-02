import type { NightlifeOption } from "@client/shared/constants/nightlife-options";
import { OptionTableFieldEditor } from "./option-table-field-editor";

interface NightlifeSingleOptionTableProps {
  label: string;
  options: NightlifeOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}

interface NightlifeMultiOptionTableProps {
  label: string;
  options: NightlifeOption[];
  values: string[];
  onToggle: (value: string) => void;
  error?: string;
}

export function NightlifeSingleOptionTable({
  label,
  options,
  value,
  onChange,
  error,
  placeholder = "Select an option",
}: NightlifeSingleOptionTableProps) {
  return (
    <OptionTableFieldEditor
      label={label}
      kind="single"
      options={options}
      value={value}
      onChange={(nextValue) => onChange(typeof nextValue === "string" ? nextValue : "")}
      error={error}
      placeholder={placeholder}
    />
  );
}

export function NightlifeMultiOptionTable({
  label,
  options,
  values,
  onToggle,
  error,
}: NightlifeMultiOptionTableProps) {
  return (
    <OptionTableFieldEditor
      label={label}
      kind="multi"
      options={options}
      value={values}
      onChange={(nextValue) => {
        const nextValues = Array.isArray(nextValue) ? nextValue : [];
        const toggled = nextValues.find((option) => !values.includes(option)) ??
          values.find((option) => !nextValues.includes(option));
        if (toggled) onToggle(toggled);
      }}
      error={error}
    />
  );
}
