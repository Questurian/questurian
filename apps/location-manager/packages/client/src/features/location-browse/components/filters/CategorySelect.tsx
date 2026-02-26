import type { ComponentType } from "react";
import { UtensilsCrossed, Moon, Hotel, Compass, MapPin } from "lucide-react";
import { cn } from "@client/shared/lib/utils";
import type { Category } from "@client/shared/services/api/types";
import type { LucideProps } from "lucide-react";

interface CategorySelectProps {
  value: Category[];
  onChange: (value: Category) => void;
  disabled?: boolean;
}

const CATEGORIES: { value: Category; label: string; icon: ComponentType<LucideProps> }[] = [
  { value: "dining", label: "Restaurants", icon: UtensilsCrossed },
  { value: "nightlife", label: "Nightlife", icon: Moon },
  { value: "accommodations", label: "Accommodations", icon: Hotel },
  { value: "attractions", label: "Attractions", icon: Compass },
  { value: "key_locations", label: "Key Locations", icon: MapPin },
];

export function CategorySelect({ value, onChange, disabled }: CategorySelectProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((category) => {
        const Icon = category.icon;
        const isActive = value.includes(category.value);

        return (
          <button
            key={category.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(category.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
              "border transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "disabled:pointer-events-none disabled:opacity-50",
              isActive
                ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
                : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
            )}
          >
            <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive && "text-primary")} />
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
