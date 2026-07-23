import type { JSX } from "react";
import {
  Coffee,
  Croissant,
  IceCreamBowl,
  Landmark,
  Music2,
  Palette,
  Sandwich,
  ShoppingBag,
  Sunset,
  Trees,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from "lucide-react";
import type { ItineraryMoment } from "@/features/articles/types/itineraryListicle";

const MOMENT_CONFIG: Record<
  ItineraryMoment,
  { label: string; Icon: LucideIcon }
> = {
  breakfast: { label: "Breakfast", Icon: Croissant },
  coffee: { label: "Coffee break", Icon: Coffee },
  lunch: { label: "Lunch", Icon: Sandwich },
  "sweet-treat": { label: "Sweet treat", Icon: IceCreamBowl },
  culture: { label: "Culture stop", Icon: Palette },
  landmark: { label: "Must-see landmark", Icon: Landmark },
  shopping: { label: "Shopping stop", Icon: ShoppingBag },
  outdoor: { label: "Outdoor break", Icon: Trees },
  sunset: { label: "Sunset stop", Icon: Sunset },
  dinner: { label: "Dinner", Icon: UtensilsCrossed },
  drinks: { label: "Drinks", Icon: Wine },
  nightlife: { label: "Nightlife", Icon: Music2 },
};

function isItineraryMoment(value: unknown): value is ItineraryMoment {
  return typeof value === "string" && value in MOMENT_CONFIG;
}

export function ItineraryMomentBadge({
  moment,
  label,
}: {
  moment?: string | null;
  label?: string | null;
}): JSX.Element | null {
  if (!isItineraryMoment(moment)) return null;

  const { Icon, label: defaultLabel } = MOMENT_CONFIG[moment];
  const displayLabel = label?.trim() || defaultLabel;

  return (
    <div className="flex items-center gap-2.5 380:gap-3 480:gap-3.5">
      <Icon
        className="size-[26px] shrink-0 text-foreground/40 380:size-[29px] 480:size-[33px] sm:size-[36px]"
        strokeWidth={1.6}
        aria-hidden
      />
      <span className="text-[13px] font-bold uppercase leading-none tracking-[0.16em] text-foreground/55 [font-family:var(--font-dm-sans)] 380:text-[14px] 480:text-[16px] sm:text-[17px]">
        {displayLabel}
      </span>
    </div>
  );
}
