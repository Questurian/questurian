import type { FieldProvenance } from "@questurian/lm-shared";

interface ProvenanceBadgeProps {
  provenance: FieldProvenance | undefined;
}

interface BadgeStyle {
  letters: string;
  title: string;
  className: string;
}

const BADGE_STYLES: Record<Exclude<FieldProvenance, "operator">, BadgeStyle> = {
  google: {
    letters: "G",
    title: "Auto-filled from Google Places",
    className: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  },
  tripadvisor: {
    letters: "TA",
    title: "Auto-filled from TripAdvisor search",
    className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
  scraper: {
    letters: "W",
    title: "Auto-filled from the venue's website",
    className: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  },
  "ai-reviews": {
    letters: "AI",
    title: "Suggested by AI from reviews",
    className: "border-purple-400/40 bg-purple-400/10 text-purple-300",
  },
  "ai-google": {
    letters: "AI",
    title: "Suggested by AI from Google place summary (reviews unusable)",
    className: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  },
};

export function ProvenanceBadge({ provenance }: ProvenanceBadgeProps) {
  if (!provenance || provenance === "operator") return null;
  const style = BADGE_STYLES[provenance];
  if (!style) return null;
  return (
    <span
      title={style.title}
      className={`inline-flex h-4 items-center rounded border px-1 text-[10px] font-semibold leading-none tracking-wide ${style.className}`}
    >
      {style.letters}
    </span>
  );
}
