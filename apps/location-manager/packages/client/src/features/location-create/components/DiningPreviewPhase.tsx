import { Check } from "lucide-react";
import { useLocationById } from "@client/shared/services/api/hooks";
import { Skeleton, ErrorAlert } from "@client/shared/components/ui";
import type { FieldProvenance } from "@questurian/lm-shared";
import type { LocationResponse } from "@client/shared/services/api/types/location.types";
import { ProvenanceBadge } from "./ProvenanceBadge";

interface DiningPreviewPhaseProps {
  locationId: number;
  onAddAnother: () => void;
  onDone: () => void;
}

function asProvenance(value: string | undefined): FieldProvenance | undefined {
  if (!value) return undefined;
  if (
    value === "google" ||
    value === "tripadvisor" ||
    value === "scraper" ||
    value === "ai-reviews" ||
    value === "ai-google" ||
    value === "operator"
  ) {
    return value;
  }
  return undefined;
}

function fieldProvenance(
  provenance: Record<string, string> | null,
  field: string
): FieldProvenance | undefined {
  if (!provenance) return undefined;
  return asProvenance(provenance[field]);
}

function tagProvenance(
  provenance: Record<string, string> | null,
  tag: string
): FieldProvenance | undefined {
  if (!provenance) return undefined;
  return asProvenance(provenance[`idealFor.${tag}`]);
}

function Row({
  label,
  value,
  provenance,
}: {
  label: string;
  value: React.ReactNode;
  provenance?: FieldProvenance;
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);

  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/40 last:border-b-0">
      <div className="flex items-center gap-1.5 min-w-[140px] shrink-0">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        {provenance ? <ProvenanceBadge provenance={provenance} /> : null}
      </div>
      <div className="text-sm text-foreground text-right break-words min-w-0 flex-1">
        {isEmpty ? <span className="text-muted-foreground/60 italic">—</span> : value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted/40 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="px-3 py-1">{children}</div>
    </div>
  );
}

function LinkValue({ href }: { href: string | null }) {
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

function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function IdealForChips({ location }: { location: LocationResponse }) {
  const tags = location.idealFor ?? [];
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 justify-end">
      {tags.map((tag) => {
        const prov = tagProvenance(location.provenance, tag);
        return (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-muted/60 text-xs"
          >
            {tag}
            {prov ? <ProvenanceBadge provenance={prov} /> : null}
          </span>
        );
      })}
    </div>
  );
}

function OperationHoursValue({ hours }: { hours: Record<string, unknown> | null }) {
  if (!hours || Object.keys(hours).length === 0) return null;
  const entries = Object.entries(hours).slice(0, 7);
  return (
    <div className="space-y-0.5 text-right">
      {entries.map(([day, value]) => (
        <div key={day} className="text-xs">
          <span className="text-muted-foreground mr-1.5">{day}:</span>
          <span>{typeof value === "string" ? value : JSON.stringify(value)}</span>
        </div>
      ))}
    </div>
  );
}

export function DiningPreviewPhase({ locationId, onAddAnother, onDone }: DiningPreviewPhaseProps) {
  const { data: location, isLoading, error } = useLocationById(locationId, "dining");

  return (
    <div className="min-h-screen flex items-start justify-center p-4 sm:p-6 bg-background">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl p-4 sm:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] sm:text-[24px] opacity-70 font-medium text-foreground truncate">
              Location Added
            </h1>
            <p className="text-xs text-muted-foreground">
              Review everything below before moving on.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 mb-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <ErrorAlert
            title="Couldn't load the location preview"
            message={error instanceof Error ? error.message : "Unknown error"}
          />
        ) : location ? (
          <div className="space-y-3 mb-6">
            <Section title="Basics">
              <Row label="Title" value={location.title} provenance={fieldProvenance(location.provenance, "title")} />
              <Row label="Name" value={location.source.name} />
              <Row label="Category" value={location.category} />
              <Row label="Type" value={location.type} provenance={fieldProvenance(location.provenance, "type")} />
              <Row label="Address" value={location.source.address} />
              <Row label="District" value={location.district} />
              <Row label="Location key" value={location.locationKey} />
              <Row label="Time zone" value={location.ianaTimeId} />
              <Row label="Coordinates" value={formatCoords(location.coordinates.lat, location.coordinates.lng)} />
            </Section>

            <Section title="Contact">
              <Row label="Phone" value={location.contact.phoneNumber} />
              <Row label="Website" value={<LinkValue href={location.contact.website} />} />
              <Row label="Email" value={location.contact.email} />
            </Section>

            <Section title="External links">
              <Row label="Google URL" value={<LinkValue href={location.contact.url || null} />} />
              <Row label="Place ID" value={location.placeId} />
              <Row
                label="TripAdvisor"
                value={<LinkValue href={location.tripadvisorUrl} />}
                provenance={fieldProvenance(location.provenance, "tripadvisorUrl")}
              />
              <Row
                label="Menu URL"
                value={<LinkValue href={location.menuUrl} />}
                provenance={fieldProvenance(location.provenance, "menuUrl")}
              />
              <Row
                label="Reservation URL"
                value={<LinkValue href={location.reservationUrl} />}
                provenance={fieldProvenance(location.provenance, "reservationUrl")}
              />
            </Section>

            <Section title="Details">
              <Row label="Ideal for" value={<IdealForChips location={location} />} />
              <Row label="Price level" value={location.priceLevel} />
              <Row
                label="TripAdvisor cuisines"
                value={(location.tripadvisorCuisines ?? []).join(", ")}
              />
              <Row
                label="TripAdvisor meal types"
                value={(location.tripadvisorMealTypes ?? []).join(", ")}
              />
              <Row
                label="TripAdvisor features"
                value={(location.tripadvisorFeatures ?? []).join(", ")}
              />
              <Row label="Hours" value={<OperationHoursValue hours={location.operationHours} />} />
            </Section>

            <Section title="Reviews">
              <Row label="Total reviews" value={location.reviewsCount ?? 0} />
              <Row label="Google" value={location.reviewsGoogleCount ?? 0} />
              <Row label="TripAdvisor" value={location.reviewsTripadvisorCount ?? 0} />
              <Row label="Last fetched" value={formatDateTime(location.reviewsFetchedAt)} />
            </Section>

            <Section title="Media">
              <Row label="Uploads" value={location.uploads.length} />
              <Row label="Instagram embeds" value={location.instagram_embeds.length} />
            </Section>
          </div>
        ) : null}

        <div className="space-y-3">
          <button
            onClick={onAddAnother}
            className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-normal"
          >
            Add Another Location
          </button>
          <button
            onClick={onDone}
            className="w-full h-10 bg-muted text-muted-foreground hover:bg-muted/90 rounded-md text-sm font-normal"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
