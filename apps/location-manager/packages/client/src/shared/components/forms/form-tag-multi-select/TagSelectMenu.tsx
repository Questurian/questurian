import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui";
import type {
  TagSelectGroup,
  TagSelectOption,
} from "../form-tag-multi-select.types";

interface TagSelectMenuProps {
  fieldName: string;
  selectedValues: string[];
  availableOptions: readonly TagSelectOption[];
  availableOptionGroups?: readonly TagSelectGroup[];
  usesOptionGroups: boolean;
  isAtLimit: boolean;
  maxSelections: number;
  placeholder: string;
  isInvalid: boolean;
  onBlur: () => void;
  onAdd: (value: string) => void;
}

export function TagSelectMenu({
  fieldName,
  selectedValues,
  availableOptions,
  availableOptionGroups,
  usesOptionGroups,
  isAtLimit,
  maxSelections,
  placeholder,
  isInvalid,
  onBlur,
  onAdd,
}: TagSelectMenuProps) {
  const hasAvailableOptions = usesOptionGroups
    ? (availableOptionGroups?.length ?? 0) > 0
    : availableOptions.length > 0;

  return (
    <Select
      key={selectedValues.join("|") || "empty"}
      value={undefined}
      onValueChange={onAdd}
      disabled={!hasAvailableOptions || isAtLimit}
    >
      <SelectTrigger
        id={fieldName}
        onBlur={onBlur}
        aria-invalid={isInvalid}
      >
        <SelectValue
          placeholder={
            isAtLimit ? `Maximum ${maxSelections} tags selected` : placeholder
          }
        />
      </SelectTrigger>
      <SelectContent>
        {usesOptionGroups
          ? availableOptionGroups?.map((group, groupIndex) => (
              <SelectGroup key={group.label}>
                <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </SelectLabel>
                {group.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {groupIndex < (availableOptionGroups?.length ?? 0) - 1 && (
                  <SelectSeparator />
                )}
              </SelectGroup>
            ))
          : availableOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
      </SelectContent>
    </Select>
  );
}
