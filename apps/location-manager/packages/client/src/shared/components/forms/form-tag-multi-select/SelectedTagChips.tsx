import { X } from "lucide-react";

interface SelectedTagChipsProps {
  selectedValues: string[];
  optionLabelByValue: Map<string, string>;
  onRemove: (value: string) => void;
}

export function SelectedTagChips({
  selectedValues,
  optionLabelByValue,
  onRemove,
}: SelectedTagChipsProps) {
  if (selectedValues.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {selectedValues.map((value) => {
        const label = optionLabelByValue.get(value) ?? value;
        return (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground"
          >
            {label}
            <button
              type="button"
              className="rounded-sm text-muted-foreground hover:text-foreground"
              onClick={() => onRemove(value)}
              aria-label={`Remove ${label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
