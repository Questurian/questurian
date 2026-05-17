import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BedDouble,
  Landmark,
  Music2,
  PlaneTakeoff,
  UtensilsCrossed,
} from "lucide-react";

type LocationFlow = {
  to: string;
  title: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
  accent: string;
};

const LOCATION_FLOWS: LocationFlow[] = [
  {
    to: "/add/dining",
    title: "Dining",
    eyebrow: "Dining",
    description:
      "Staged dining flow: name/address lookup, entities review, classification, then optional fields before creation.",
    icon: UtensilsCrossed,
    accent: "from-amber-300/25 via-amber-200/8 to-transparent",
  },
  {
    to: "/add/nightlife",
    title: "Nightlife",
    eyebrow: "After Dark",
    description:
      "Full nightlife field form (space, scene, contact) stored as a nightlife document. Add media from Home after creation.",
    icon: Music2,
    accent: "from-cyan-300/25 via-cyan-200/8 to-transparent",
  },
  {
    to: "/add/accommodations",
    title: "Accommodations",
    eyebrow: "Stay",
    description:
      "Full accommodations flow: Google entities prefill, structured stay/experience/details fields, and an accommodations JSON document.",
    icon: BedDouble,
    accent: "from-emerald-300/25 via-emerald-200/8 to-transparent",
  },
  {
    to: "/add/attractions",
    title: "Attractions",
    eyebrow: "Explore",
    description:
      "Staged attractions flow: Google prefill, profile dropdowns, visit/contact details, and attractions details JSON.",
    icon: Landmark,
    accent: "from-rose-300/25 via-rose-200/8 to-transparent",
  },
  {
    to: "/add/key-locations",
    title: "Key Locations",
    eyebrow: "Transit",
    description:
      "Staged key locations flow: Google prefill, required type/status dropdowns, operations schedule, and structured key location details JSON.",
    icon: PlaneTakeoff,
    accent: "from-violet-300/25 via-violet-200/8 to-transparent",
  },
];

export function AddLocationChooser() {
  return (
    <div className="min-h-[calc(100vh-7rem)] py-2 sm:py-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:gap-6">
        <header className="px-1">
          <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
            Add New Location
          </h1>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {LOCATION_FLOWS.map((flow) => {
            const Icon = flow.icon;

            return (
              <Link
                key={flow.to}
                to={flow.to}
                className="group relative overflow-hidden rounded-[24px] border border-border bg-card/75 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:bg-accent/40 hover:shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:p-6"
              >
                <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${flow.accent}`} />
                <div className="relative flex h-full flex-col gap-5">
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/5 bg-gradient-to-br ${flow.accent} shadow-[0_12px_30px_rgba(0,0,0,0.24)]`}
                    >
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                        {flow.eyebrow}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold leading-tight text-foreground">
                        {flow.title}
                      </h2>
                    </div>
                  </div>

                  <p className="text-sm leading-6 text-muted-foreground">{flow.description}</p>

                  <div className="mt-auto flex items-center justify-between pt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    <span>Open flow</span>
                    <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
