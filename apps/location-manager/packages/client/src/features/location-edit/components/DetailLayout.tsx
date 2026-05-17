import type { ReactNode } from "react";
import type { FieldProvenance } from "@questurian/lm-shared";
import { ProvenanceBadge } from "@client/features/location-create/components/ProvenanceBadge";

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-border rounded-lg overflow-hidden">
      <header className="px-4 py-2 bg-muted/40 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      </header>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}

interface DetailRowProps {
  label: string;
  provenance?: FieldProvenance;
  description?: string;
  multiline?: boolean;
  children: ReactNode;
  error?: string;
}

export function DetailRow({
  label,
  provenance,
  description,
  multiline = false,
  children,
  error,
}: DetailRowProps) {
  if (multiline) {
    return (
      <div className="py-3 border-b border-border/40 last:border-b-0">
        <div className="flex items-center gap-1.5 mb-2">
          <RowLabel>{label}</RowLabel>
          {provenance ? <ProvenanceBadge provenance={provenance} /> : null}
        </div>
        <div>{children}</div>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="py-2.5 border-b border-border/40 last:border-b-0 sm:flex sm:items-start sm:gap-4">
      <div className="flex items-center gap-1.5 sm:min-w-[200px] sm:shrink-0 sm:pt-2 mb-1.5 sm:mb-0">
        <RowLabel>{label}</RowLabel>
        {provenance ? <ProvenanceBadge provenance={provenance} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        {children}
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

function RowLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{children}</span>
  );
}

export function ReadOnlyValue({ value }: { value: ReactNode }) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);
  return (
    <div className="text-sm text-foreground/80 break-words py-2">
      {isEmpty ? <span className="text-muted-foreground/60 italic">—</span> : value}
    </div>
  );
}

export function LinkValue({ href }: { href: string | null | undefined }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary hover:underline break-all"
    >
      {href}
    </a>
  );
}
