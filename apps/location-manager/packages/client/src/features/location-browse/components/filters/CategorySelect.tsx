import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@client/components/ui/select";
import type { Category } from "@client/shared/services/api/types";

interface CategorySelectProps {
  value: Category | null;
  onChange: (value: Category) => void;
  disabled?: boolean;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "dining", label: "Dining" },
  { value: "accommodations", label: "Accommodations" },
  { value: "attractions", label: "Attractions" },
  { value: "nightlife", label: "Nightlife" }
];

export function CategorySelect({ value, onChange, disabled }: CategorySelectProps) {
  return (
    <div>
      <Select value={value ?? ""} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger style={{ width: "200px" }}>
          <SelectValue placeholder="Select category" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map(cat => (
            <SelectItem key={cat.value} value={cat.value}>
              {cat.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
