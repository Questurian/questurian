import type { Control, FieldValues, Path } from "react-hook-form";

export interface TagSelectOption {
  value: string;
  label: string;
}

export interface TagSelectGroup {
  label: string;
  options: readonly TagSelectOption[];
}

export interface FormTagMultiSelectProps<T extends FieldValues = FieldValues> {
  name: Path<T>;
  label: string;
  control: Control<T>;
  options?: readonly TagSelectOption[];
  optionGroups?: readonly TagSelectGroup[];
  maxSelections?: number;
  placeholder?: string;
  description?: string;
  allowDirectTagArrayInput?: boolean;
}
