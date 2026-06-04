import { useDeferredValue, useState } from "react";
import { Button, Input, Label } from "@client/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { usePayloadMediaSets } from "@client/shared/services/api/hooks";
import type { PayloadMediaSetItem } from "@client/shared/services/api/types";
import { Check, ChevronLeft, ChevronRight, Image, Loader2, Search } from "lucide-react";

interface MediaSetPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function MediaSetPicker({ value, onChange }: MediaSetPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const selectedQuery = usePayloadMediaSets({
    ids: value ? [value] : undefined,
    limit: 1,
    enabled: Boolean(value),
  });
  const mediaSetsQuery = usePayloadMediaSets({
    query: deferredSearch || undefined,
    page,
    limit: 50,
    enabled: isOpen,
    keepPreviousData: true,
  });
  const selected = selectedQuery.data?.mediaSets?.[0] ?? null;
  const mediaSets = mediaSetsQuery.data?.mediaSets ?? [];
  const hasSelectedValue = value.trim().length > 0;

  function handlePick(item: PayloadMediaSetItem) {
    onChange(item.id);
    setIsOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>Img</Label>
        {selected && (
          <span className="truncate text-xs text-muted-foreground">{selected.title}</span>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-muted/10 p-3">
        {selected ? (
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
              {selected.previewUrl ? (
                <img
                  src={selected.previewUrl}
                  alt={selected.altText || selected.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Image className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{selected.title}</p>
              <p className="truncate text-xs text-muted-foreground">Media set ID: {selected.id}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
              Change
            </Button>
          </div>
        ) : hasSelectedValue ? (
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
              {selectedQuery.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <Check className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {selectedQuery.isLoading ? "Loading selected media set" : "Media set selected"}
              </p>
              <p className="truncate text-xs text-muted-foreground">Media set ID: {value}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
              Change
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
            <Image className="h-4 w-4" />
            Choose media set
          </Button>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Select Tour Image</DialogTitle>
            <DialogDescription>
              Choose one Payload media set for this tour image.
            </DialogDescription>
          </DialogHeader>

          <div className="border-b px-6 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by title, alt text, photographer, or external ref"
                className="h-11 pl-10"
                autoFocus
              />
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-6">
            {mediaSetsQuery.isLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading media sets
              </div>
            ) : mediaSetsQuery.error ? (
              <div className="py-16 text-center text-sm text-destructive">
                {mediaSetsQuery.error.message}
              </div>
            ) : mediaSets.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No media sets found.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {mediaSets.map((item) => {
                  const isSelected = item.id === value;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handlePick(item)}
                      className={`group overflow-hidden rounded-md border bg-background text-left transition-colors ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border hover:border-primary/70"
                      }`}
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-muted">
                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt={item.altText || item.title}
                            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <Image className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 p-3">
                        <div className="flex items-start gap-2">
                          <p className="line-clamp-2 min-h-10 flex-1 text-sm font-medium text-foreground">
                            {item.title}
                          </p>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.location || item.photographerCredit || item.status || item.id}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {mediaSetsQuery.data
                ? `Page ${mediaSetsQuery.data.page} of ${mediaSetsQuery.data.totalPages} · ${mediaSetsQuery.data.totalDocs} media sets`
                : "Media sets"}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!mediaSetsQuery.data?.hasPrevPage || mediaSetsQuery.isFetching}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={!mediaSetsQuery.data?.hasNextPage || mediaSetsQuery.isFetching}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
