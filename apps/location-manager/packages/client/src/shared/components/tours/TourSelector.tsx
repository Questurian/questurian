import { useDeferredValue, useMemo, useState } from "react";
import { Button, Input } from "@client/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { useTours } from "@client/shared/services/api/hooks";
import type { Tour } from "@client/shared/services/api/types";
import { Check, Loader2, Search, Ticket, X } from "lucide-react";

interface TourSelectorProps {
  selectedTourIds: number[];
  onChange: (tourIds: number[]) => void;
  disabled?: boolean;
  isSaving?: boolean;
  error?: string | null;
}

function normalizeSelectedTourIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
}

function TourSummary({ tour }: { tour: Tour }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">{tour.title}</p>
      <p className="truncate text-xs text-muted-foreground">
        {tour.price} · {tour.bookingLink}
      </p>
    </div>
  );
}

export function TourSelector({
  selectedTourIds,
  onChange,
  disabled = false,
  isSaving = false,
  error = null,
}: TourSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const normalizedSelectedIds = normalizeSelectedTourIds(selectedTourIds);

  const selectedToursQuery = useTours({
    ids: normalizedSelectedIds,
    limit: Math.max(normalizedSelectedIds.length, 1),
    enabled: normalizedSelectedIds.length > 0,
  });
  const searchToursQuery = useTours({
    query: deferredSearch || undefined,
    limit: 50,
    enabled: isOpen,
  });

  const selectedToursById = useMemo(
    () => new Map((selectedToursQuery.data ?? []).map((tour) => [tour.id, tour])),
    [selectedToursQuery.data]
  );
  const selectedTours = normalizedSelectedIds
    .map((id) => selectedToursById.get(id))
    .filter((tour): tour is Tour => Boolean(tour));

  function toggleTour(tour: Tour) {
    if (disabled || isSaving) return;
    if (normalizedSelectedIds.includes(tour.id)) {
      onChange(normalizedSelectedIds.filter((id) => id !== tour.id));
      return;
    }
    onChange([...normalizedSelectedIds, tour.id]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Ticket className="h-4 w-4 text-muted-foreground" />
          <span>Tours</span>
          <span className="text-muted-foreground">({normalizedSelectedIds.length})</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setIsOpen(true)}
          disabled={disabled}
        >
          Select tours
        </Button>
      </div>

      <div className="rounded-md border border-border bg-muted/15 p-3">
        {normalizedSelectedIds.length > 0 && selectedToursQuery.isLoading ? (
          <div className="flex items-center py-1 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading linked tours
          </div>
        ) : selectedTours.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tours linked.</p>
        ) : (
          <div className="space-y-2">
            {selectedTours.map((tour) => (
              <div
                key={tour.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
              >
                <TourSummary tour={tour} />
                <button
                  type="button"
                  className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  onClick={() => toggleTour(tour)}
                  aria-label={`Remove ${tour.title}`}
                  disabled={disabled || isSaving}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {(error || isSaving) && (
          <p className="mt-2 text-xs text-muted-foreground">
            {isSaving ? "Saving tours..." : error}
          </p>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[86vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Link Tours</DialogTitle>
            <DialogDescription>
              Select existing Location Manager tours for this attraction.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-4 overflow-hidden p-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="min-h-0 rounded-md border border-border bg-muted/10">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-medium text-foreground">Linked tours</p>
                <p className="text-xs text-muted-foreground">Order is preserved.</p>
              </div>
              <div className="max-h-[55vh] overflow-y-auto p-4">
                {selectedTours.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tours selected.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedTours.map((tour) => (
                      <div
                        key={tour.id}
                        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
                      >
                        <TourSummary tour={tour} />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleTour(tour)}
                          disabled={disabled || isSaving}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0 rounded-md border border-border bg-muted/10">
              <div className="border-b px-4 py-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search existing tours"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="max-h-[55vh] overflow-y-auto p-4">
                {searchToursQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading tours
                  </div>
                ) : (searchToursQuery.data?.length ?? 0) === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No tours found.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {searchToursQuery.data?.map((tour) => {
                      const isSelected = normalizedSelectedIds.includes(tour.id);
                      return (
                        <div
                          key={tour.id}
                          className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
                        >
                          <TourSummary tour={tour} />
                          <Button
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            className="ml-auto"
                            onClick={() => toggleTour(tour)}
                            disabled={disabled || isSaving}
                          >
                            {isSelected && <Check className="h-4 w-4" />}
                            {isSelected ? "Linked" : "Link"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
