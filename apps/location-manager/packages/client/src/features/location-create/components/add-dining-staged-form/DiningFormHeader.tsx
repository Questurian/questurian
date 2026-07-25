import { CheckCircle2, ChevronLeft, UtensilsCrossed } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@client/components/ui/button";
import type { DiningFormSection } from "./add-dining-staged-form.types";

interface DiningFormHeaderProps {
  activeSection: DiningFormSection;
  sections: Array<{ key: DiningFormSection; label: string; complete: boolean }>;
  canOpenSection: (section: DiningFormSection) => boolean;
  onOpenSection: (section: DiningFormSection) => void;
}

export function DiningFormHeader({
  activeSection,
  sections,
  canOpenSection,
  onOpenSection,
}: DiningFormHeaderProps) {
  return (
    <div className="mb-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-4 h-4 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Add Dining</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          asChild
          className="h-9 border-border/80 bg-background/60 px-3 text-foreground hover:bg-accent/70"
        >
          <Link to="/add">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {sections.map((section, index) => {
          const isActive = activeSection === section.key;
          const isDisabled = !canOpenSection(section.key);
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => onOpenSection(section.key)}
              disabled={isDisabled}
              className={`inline-flex h-10 flex-1 min-w-[7rem] items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-border bg-muted text-foreground"
                  : isDisabled
                    ? "cursor-not-allowed border-border/50 bg-background text-muted-foreground/55"
                    : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <span className="text-muted-foreground">{index + 1}.</span>
              <span>{section.label}</span>
              {section.complete && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
