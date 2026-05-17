import type { LucideIcon } from "lucide-react";

type ToneClasses = {
  bg: string;
  icon: string;
};

const TONE_MAP: Record<"blue" | "muted", ToneClasses> = {
  blue: { bg: "bg-blue-500", icon: "text-white" },
  muted: { bg: "bg-muted", icon: "text-muted-foreground" },
};

interface ProcessingCardProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  tone?: "blue" | "muted";
}

export function ProcessingCard({
  icon: Icon,
  title,
  subtitle,
  tone = "blue",
}: ProcessingCardProps) {
  const t = TONE_MAP[tone];
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-border/60 bg-background/40 px-6 py-10 text-center">
      <div className={`w-12 h-12 rounded-lg ${t.bg} flex items-center justify-center animate-pulse`}>
        <Icon className={`w-6 h-6 ${t.icon}`} />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {subtitle && (
        <p className="max-w-xs text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}
