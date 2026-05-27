import { useDeferredValue, useEffect, useState } from "react";
import { Button } from "@client/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@client/components/ui/dialog";
import { Input } from "@client/components/ui/input";
import { cn } from "@client/shared/lib/utils";
import { usePayloadMediaSets } from "@client/shared/services/api/hooks";
import type { PayloadMediaSetItem } from "@client/shared/services/api/types";
import { Check, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import type { PayloadMediaSetSelection } from "./usePayloadMediaSetSelection";

const SEARCH_PAGE_SIZE = 20;

interface PayloadMediaSetSelectorProps {
  selection: PayloadMediaSetSelection;
}

function formatStatusLabel(status: string | null): string {
  if (!status) return "Unknown";

  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function MediaTile({
  item,
  isSelected,
  isDisabled,
  selectionIndex,
  onToggle,
}: {
  item: PayloadMediaSetItem;
  isSelected: boolean;
  isDisabled: boolean;
  selectionIndex?: number;
  onToggle: (item: PayloadMediaSetItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(item)}
      disabled={isDisabled}
      className={cn(
        "flex h-full flex-col gap-2 rounded-md border bg-background p-2 text-left transition-colors",
        isSelected
          ? "border-primary ring-1 ring-primary/40"
          : "border-border hover:border-primary/50",
        isDisabled && !isSelected && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded bg-muted">
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt={item.altText || item.title || "Payload CMS photo"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            No preview
          </div>
        )}
        {selectionIndex !== undefined && (
          <div className="absolute left-2 top-2 rounded-full bg-background/95 px-2 py-1 text-[10px] font-semibold text-foreground shadow">
            #{selectionIndex + 1}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-xs font-medium text-foreground">
            {item.title}
          </p>
          {isSelected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
        </div>
        <p className="line-clamp-2 text-[11px] text-muted-foreground">
          {item.altText || item.photographerCredit || "No alt text or photographer credit"}
        </p>
        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5">
            {formatStatusLabel(item.status)}
          </span>
          {item.location && (
            <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5">
              {item.location}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function PayloadMediaSetSelector({ selection }: PayloadMediaSetSelectorProps) {
  const {
    selectedIds,
    handleToggle,
    availableSelectionSlots,
    isAtCapacity,
    isPending,
    saveError,
  } = selection;

  const [isOpen, setIsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearchInput = useDeferredValue(searchInput.trim());

  useEffect(() => {
    setPage(1);
  }, [deferredSearchInput]);

  const searchMediaSetsQuery = usePayloadMediaSets({
    query: deferredSearchInput || undefined,
    page,
    limit: SEARCH_PAGE_SIZE,
    enabled: isOpen,
    keepPreviousData: true,
  });

  const hasPrevPage = searchMediaSetsQuery.data?.hasPrevPage ?? page > 1;
  const hasNextPage =
    searchMediaSetsQuery.data?.hasNextPage ??
    ((searchMediaSetsQuery.data?.mediaSets.length ?? 0) >= SEARCH_PAGE_SIZE);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
      >
        Select from CMS
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Select Payload CMS Photos</DialogTitle>
            <DialogDescription>
              Choose existing `media-sets` from Payload for this attraction. Selections save immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[calc(85vh-88px)] flex-col gap-4 overflow-hidden p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[280px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search title, alt text, photographer credit, or external ref"
                  className="pl-10"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedIds.length} selected / {availableSelectionSlots} available
              </div>
              {isPending && (
                <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving
                </div>
              )}
            </div>

            {(saveError || availableSelectionSlots === 0) && (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {saveError || "Uploads already use all 20 gallery slots for this attraction."}
              </div>
            )}

            <div className="min-h-0 flex-1 rounded-md border border-border bg-muted/10">
              <div className="border-b px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Payload media sets</p>
                    <p className="text-xs text-muted-foreground">
                      Blank search shows the most recently updated media. 20 items per page.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {searchMediaSetsQuery.isFetching && (
                      <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Updating
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setPage(searchMediaSetsQuery.data?.prevPage ?? Math.max(1, page - 1))
                      }
                      disabled={!hasPrevPage}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-[96px] text-center text-xs text-muted-foreground">
                      Page {searchMediaSetsQuery.data?.page ?? page} of{" "}
                      {searchMediaSetsQuery.data?.totalPages ?? 1}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        setPage(searchMediaSetsQuery.data?.nextPage ?? page + 1)
                      }
                      disabled={!hasNextPage}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex max-h-full min-h-0 flex-col p-4">
                {searchMediaSetsQuery.isLoading ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading Payload media sets...
                  </div>
                ) : searchMediaSetsQuery.isError ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Failed to load Payload media sets.
                  </div>
                ) : (searchMediaSetsQuery.data?.mediaSets.length ?? 0) === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    No matching Payload photos found.
                  </div>
                ) : (
                  <>
                    <div className="grid flex-1 gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                      {searchMediaSetsQuery.data?.mediaSets.map((item) => {
                        const selectionIndex = selectedIds.indexOf(item.id);
                        const isSelected = selectionIndex >= 0;

                        return (
                          <MediaTile
                            key={item.id}
                            item={item}
                            isSelected={isSelected}
                            isDisabled={
                              isPending || (isAtCapacity && !isSelected)
                            }
                            selectionIndex={isSelected ? selectionIndex : undefined}
                            onToggle={handleToggle}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                      <span>
                        Showing {(searchMediaSetsQuery.data?.mediaSets.length ?? 0)} of{" "}
                        {searchMediaSetsQuery.data?.totalDocs ?? 0} media sets
                      </span>
                      <div className="flex items-center gap-2">
                        {searchMediaSetsQuery.isFetching && (
                          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Updating
                          </div>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setPage(searchMediaSetsQuery.data?.prevPage ?? Math.max(1, page - 1))
                          }
                          disabled={!hasPrevPage}
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setPage(searchMediaSetsQuery.data?.nextPage ?? page + 1)
                          }
                          disabled={!hasNextPage}
                          aria-label="Next page"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
