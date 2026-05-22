import { useDeferredValue, useMemo, useState } from "react";
import { Button, Input, Textarea } from "@client/components/ui";
import { TourFormDialog } from "@client/shared/components/tours/TourFormDialog";
import { usePreviewTourImport, useSyncPayloadTour, useTours } from "@client/shared/services/api/hooks";
import type { Tour, TourDraftPreview } from "@client/shared/services/api/types";
import { useToast } from "@client/shared/hooks/useToast";
import { formatLocationHierarchy } from "@client/shared/lib/utils";
import { AlertCircle, CloudUpload, Copy, ExternalLink, Loader2, Pencil, Plus, Search, Ticket, Wand2 } from "lucide-react";
import { ApiError } from "@client/shared/services/api/client";

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatImportError(error: unknown): string {
  if (error instanceof ApiError) {
    return JSON.stringify(
      {
        status: error.status,
        code: error.code,
        message: error.message,
        details: error.details,
      },
      null,
      2
    );
  }
  return error instanceof Error ? error.message : "Tour import failed.";
}

function TourImportPanel({
  onDraftReady,
  onOpenExisting,
}: {
  onDraftReady: (draft: TourDraftPreview) => void;
  onOpenExisting: (tour: Tour) => void;
}) {
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<TourDraftPreview | null>(null);
  const [errorText, setErrorText] = useState("");
  const previewImport = usePreviewTourImport();
  const canImport = url.trim().length > 0 && !previewImport.isPending;

  function runImport() {
    const value = url.trim();
    if (!value) return;
    setDraft(null);
    setErrorText("");
    previewImport.mutate(value, {
      onSuccess: (nextDraft) => {
        setDraft(nextDraft);
        if (!nextDraft.duplicateTour) {
          onDraftReady(nextDraft);
        }
      },
      onError: (err) => setErrorText(formatImportError(err)),
    });
  }

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Wand2 className="h-4 w-4 text-primary" />
            Import from URL
          </div>
          <Input
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setErrorText("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") runImport();
            }}
            placeholder="https://www.viator.com/tours/..."
          />
        </div>
        <Button type="button" onClick={runImport} disabled={!canImport} className="lg:mt-7">
          {previewImport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Detect and import
        </Button>
      </div>

      {draft?.duplicateTour && (
        <div className="border-t border-border p-4">
          <div className="rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-medium">Existing tour uses this booking link.</p>
            <p className="mt-1">{draft.duplicateTour.title}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => onOpenExisting(draft.duplicateTour!)}>
                Open existing
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onDraftReady(draft)}>
                Import anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {errorText && (
        <div className="border-t border-border p-4">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertCircle className="h-4 w-4" />
                Import failed
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void navigator.clipboard.writeText(errorText)}
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
            <Textarea value={errorText} readOnly className="min-h-28 font-mono text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}

function PayloadTourStatus({ tour }: { tour: Tour }) {
  const s = tour.payloadSync;
  if (!s) {
    return <span className="text-xs text-muted-foreground">Not synced yet</span>;
  }
  if (s.syncStatus === "success" && s.payloadDocId) {
    return (
      <div className="min-w-0">
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Synced</span>
        <p className="truncate font-mono text-[10px] text-muted-foreground" title={s.payloadDocId}>
          {s.payloadDocId}
        </p>
        {s.lastSyncedAt && (
          <p className="text-[10px] text-muted-foreground">{formatDate(s.lastSyncedAt)}</p>
        )}
      </div>
    );
  }
  if (s.syncStatus === "failed") {
    return (
      <div className="min-w-0">
        <span className="text-xs font-medium text-destructive">Failed</span>
        {s.errorMessage && (
          <p className="line-clamp-2 text-[10px] text-destructive" title={s.errorMessage}>
            {s.errorMessage}
          </p>
        )}
      </div>
    );
  }
  return <span className="text-xs text-amber-600 dark:text-amber-400">Pending…</span>;
}

function TourRow({
  tour,
  onEdit,
  onSyncPayload,
  syncMutation,
}: {
  tour: Tour;
  onEdit: (tour: Tour) => void;
  onSyncPayload: (tour: Tour) => void;
  syncMutation: ReturnType<typeof useSyncPayloadTour>;
}) {
  const isThisSyncing = syncMutation.isPending && syncMutation.variables === tour.id;

  return (
    <div className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_100px_100px_minmax(0,140px)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold text-foreground">{tour.title}</h2>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          Image media set: {tour.imgPayloadMediaSetId}
        </p>
      </div>

      <a
        href={tour.bookingLink}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-w-0 items-center gap-1 text-sm text-primary hover:underline"
      >
        <span className="truncate">{tour.bookingLink}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>

      <div className="min-w-0 text-xs text-muted-foreground">
        {tour.locationKey?.trim() ? (
          <span title={tour.locationKey}>{formatLocationHierarchy(tour.locationKey.trim())}</span>
        ) : (
          <span className="italic">—</span>
        )}
      </div>

      <div className="text-sm font-medium text-foreground">{tour.price}</div>
      <div className="text-xs text-muted-foreground">{formatDate(tour.updated_at)}</div>

      <div className="text-xs">
        <PayloadTourStatus tour={tour} />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={syncMutation.isPending}
          onClick={() => {
            onSyncPayload(tour);
          }}
        >
          {isThisSyncing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </>
          ) : (
            <>
              <CloudUpload className="h-3.5 w-3.5" />
            </>
          )}
          <span className="ml-1 hidden sm:inline">Sync to Payload</span>
          <span className="ml-1 sm:hidden">Sync</span>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onEdit(tour)}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </div>
    </div>
  );
}

export function Tours() {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTour, setEditingTour] = useState<Tour | null>(null);
  const [importDraft, setImportDraft] = useState<TourDraftPreview | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const toursQuery = useTours({
    query: deferredSearch || undefined,
    limit: 100,
  });
  const syncPayloadTour = useSyncPayloadTour();

  const tours = toursQuery.data ?? [];
  const resultLabel = useMemo(() => {
    if (toursQuery.isLoading) return "Loading";
    return `${tours.length} ${tours.length === 1 ? "tour" : "tours"}`;
  }, [tours.length, toursQuery.isLoading]);

  function openCreateDialog() {
    setEditingTour(null);
    setImportDraft(null);
    setIsFormOpen(true);
  }

  function openEditDialog(tour: Tour) {
    setEditingTour(tour);
    setImportDraft(null);
    setIsFormOpen(true);
  }

  function openImportDraft(draft: TourDraftPreview) {
    setEditingTour(null);
    setImportDraft(draft);
    setIsFormOpen(true);
  }

  function handleSyncPayload(tour: Tour) {
    const pos = { x: window.innerWidth / 2, y: 96 };
    syncPayloadTour.mutate(tour.id, {
      onSuccess: (result) => {
        if (result.status === "success") {
          showToast(`Tour synced to Payload (doc ${result.payloadDocId}).`, pos);
        } else {
          showToast(result.error || "Tour sync failed.", pos);
        }
      },
      onError: (err) => {
        showToast(err instanceof Error ? err.message : "Tour sync failed.", pos);
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Ticket className="h-4 w-4" />
            <span>Location Manager</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Tours
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Catalog tours and optionally set <span className="font-medium text-foreground">place / geography</span>{" "}
            (Payload <code className="text-foreground/90">locations</code>) for site organization. Link tours to
            attractions separately. Use <span className="font-medium text-foreground">Sync to Payload</span> to
            push each row to Questura, or sync via a linked attraction&apos;s Payload sync.
          </p>
        </div>
        <Button type="button" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          New tour
        </Button>
      </div>

      <TourImportPanel onDraftReady={openImportDraft} onOpenExisting={openEditDialog} />

      <div className="rounded-md border border-border bg-background">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-lg flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, booking link, price, or place key"
              className="pl-10"
            />
          </div>
          <div className="text-sm text-muted-foreground">{resultLabel}</div>
        </div>

        {toursQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading tours
          </div>
        ) : toursQuery.error ? (
          <div className="py-16 text-center text-sm text-destructive">
            {toursQuery.error.message}
          </div>
        ) : tours.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-foreground">No tours found.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a tour to make it available in attraction linking.
            </p>
          </div>
        ) : (
          <div>
            <div className="hidden border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_100px_100px_minmax(0,140px)_auto]">
              <span>Tour</span>
              <span>Booking</span>
              <span>Place</span>
              <span>Price</span>
              <span>Updated</span>
              <span>Payload</span>
              <span className="sr-only">Actions</span>
            </div>
            {tours.map((tour) => (
              <TourRow
                key={tour.id}
                tour={tour}
                onEdit={openEditDialog}
                onSyncPayload={handleSyncPayload}
                syncMutation={syncPayloadTour}
              />
            ))}
          </div>
        )}
      </div>

      <TourFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        tour={editingTour}
        importDraft={importDraft}
      />
    </div>
  );
}
