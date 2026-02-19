import type { Category } from "@client/shared/services/api/types";

interface CategorySelectProps {
  value: Category[];
  onChange: (value: Category) => void;
  disabled?: boolean;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "dining", label: "Restaurants" },
  { value: "nightlife", label: "Nightlife" },
  { value: "accommodations", label: "Accommodations" },
  { value: "attractions", label: "Attractions" }
];

export function CategorySelect({ value, onChange, disabled }: CategorySelectProps) {
  return (
    <div className="flex flex-wrap gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      {CATEGORIES.map((category) => (
        <label
          key={category.value}
          className="inline-flex items-center gap-2 text-xs text-foreground"
        >
          <input
            type="checkbox"
            checked={value.includes(category.value)}
            onChange={() => onChange(category.value)}
            disabled={disabled}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50"
          />
          <span>{category.label}</span>
        </label>
      ))}
    </div>
  );
}
