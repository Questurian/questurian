import type { JSX } from "react";
import {
  Bike,
  Binoculars,
  Building2,
  Car,
  Coffee,
  CookingPot,
  Croissant,
  Footprints,
  IceCreamBowl,
  Landmark,
  Laptop,
  Map,
  Martini,
  Music2,
  Palette,
  Route,
  Sailboat,
  Sandwich,
  ScrollText,
  ShoppingBag,
  Sparkles,
  Store,
  Sunset,
  Trees,
  University,
  UtensilsCrossed,
  Waves,
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
  "morning-walk": { label: "Morning walk", Icon: Footprints },
  "remote-work": { label: "Remote work", Icon: Laptop },
  "coworking-stop": { label: "Coworking stop", Icon: Laptop },
  lunch: { label: "Lunch", Icon: Sandwich },
  "street-food": { label: "Street food", Icon: CookingPot },
  "sweet-treat": { label: "Sweet treat", Icon: IceCreamBowl },
  culture: { label: "Culture stop", Icon: Palette },
  "historic-site": { label: "Historic site", Icon: ScrollText },
  "museum-visit": { label: "Museum visit", Icon: University },
  landmark: { label: "Must-see landmark", Icon: Landmark },
  "guided-tour": { label: "Guided tour", Icon: Map },
  "local-market": { label: "Local market", Icon: Store },
  shopping: { label: "Shopping stop", Icon: ShoppingBag },
  outdoor: { label: "Outdoor break", Icon: Trees },
  "beach-time": { label: "Beach time", Icon: Waves },
  "scenic-viewpoint": { label: "Scenic viewpoint", Icon: Binoculars },
  "wellness-break": { label: "Wellness break", Icon: Sparkles },
  "active-adventure": { label: "Active adventure", Icon: Bike },
  "boat-ride": { label: "Boat ride", Icon: Sailboat },
  "day-trip": { label: "Day trip", Icon: Car },
  "in-transit": { label: "In transit", Icon: Route },
  sunset: { label: "Sunset stop", Icon: Sunset },
  "rooftop-stop": { label: "Rooftop stop", Icon: Building2 },
  dinner: { label: "Dinner", Icon: UtensilsCrossed },
  cocktails: { label: "Cocktails", Icon: Martini },
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
