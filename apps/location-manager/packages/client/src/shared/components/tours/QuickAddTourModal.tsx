import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Button, Input } from "@client/components/ui";
import {
  usePreviewTourImport,
  useUpdateLocation,
  useLocationDetail,
} from "@client/shared/services/api/hooks";
import type {
  Category,
  Tour,
  TourDraftPreview,
} from "@client/shared/services/api/types";
import { useToast } from "@client/shared/hooks/useToast";
import { TourFormDialog } from "./TourFormDialog";
import { AlertCircle, Check, ExternalLink, Link2, Loader2, Ticket, Wand2 } from "lucide-react";

interface QuickAddTourModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: number;
  locationCategory: Category;
  locationKey: string | null;
  locationName: string;
}

function normalizeTourIds(ids: number[] | null | undefined): number[] {
  if (!Array.isArray(ids)) return [];
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
}

export function QuickAddTourModal({
  open,
  onOpenChange,
  locationId,
  locationCategory,
  locationKey,
  locationName,
}: QuickAddTourModalProps) {
  const { showToast } = useToast();
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<TourDraftPreview | null>(null);
  const [errorText, setErrorText] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [pendingLinkTourId, setPendingLinkTourId] = useState<number | null>(null);
  const [linkErrorMessage, setLinkErrorMessage] = useState<string | null>(null);
  // Set when the create-Tour onSuccess fires; tells the form-close handler to defer to the link mutation rather than dismissing the wrapper.
  const [linkInFlight, setLinkInFlight] = useState(false);

  const previewImport = usePreviewTourImport();
  const updateLocation = useUpdateLocation();
  const detailQuery = useLocationDetail(open ? locationId : null, locationCategory);
  const currentTourIds = normalizeTourIds(detailQuery.data?.tourIds);

  function resetState() {
    setUrl("");
    setDraft(null);
    setErrorText("");
    setFormOpen(false);
    setPendingLinkTourId(null);
    setLinkErrorMessage(null);
    setLinkInFlight(false);
    previewImport.reset();
    updateLocation.reset();
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetState();
    onOpenChange(next);
  }

  function runImport() {
    const value = url.trim();
    if (!value) return;
    setDraft(null);
    setErrorText("");
    setLinkErrorMessage(null);
    previewImport.mutate(value, {
      onSuccess: (nextDraft) => {
        setDraft(nextDraft);
        if (!nextDraft.duplicateTour) {
          setFormOpen(true);
        }
      },
      onError: (err) => {
        setErrorText(err instanceof Error ? err.message : "Tour import failed.");
      },
    });
  }

  function linkTourIdToLocation(tourId: number) {
    setPendingLinkTourId(tourId);
    setLinkErrorMessage(null);
    const nextIds = Array.from(new Set([...currentTourIds, tourId]));
    updateLocation.mutate(
      {
        category: locationCategory,
        id: locationId,
        data: { tourIds: nextIds },
      },
      {
        onSuccess: () => {
          const pos = { x: window.innerWidth / 2, y: 96 };
          showToast(`Tour linked to ${locationName}.`, pos);
          setPendingLinkTourId(null);
          setLinkInFlight(false);
          handleOpenChange(false);
        },
        onError: (err) => {
          setPendingLinkTourId(null);
          setLinkInFlight(false);
          setLinkErrorMessage(
            err instanceof Error ? err.message : "Link failed. Retry, or link from the attraction's edit page."
          );
        },
      }
    );
  }

  function handleCreatedTour(createdTour: Tour) {
    // TourFormDialog will close itself synchronously after this callback returns;
    // flag link-in-flight so the form-close handler does not dismiss the wrapper.
    setLinkInFlight(true);
    linkTourIdToLocation(createdTour.id);
  }

  function importAnyway() {
    if (!draft) return;
    setFormOpen(true);
  }

  const isImporting = previewImport.isPending;
  const isLinking = updateLocation.isPending;
  const duplicateTour = draft?.duplicateTour ?? null;
  const duplicateAlreadyLinked =
    duplicateTour != null && currentTourIds.includes(duplicateTour.id);

  return (
    <>
      <Dialog open={open && !formOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              Quick-link tour to {locationName}
            </DialogTitle>
            <DialogDescription>
              Paste a Viator tour URL. A new tour will be created and linked to this attraction, or — if the
              URL already exists in the catalog — you can link the existing tour in one click.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Input
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setErrorText("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !isImporting) runImport();
                }}
                placeholder="https://www.viator.com/tours/..."
                disabled={isImporting}
                autoFocus
              />
              <Button
                type="button"
                onClick={runImport}
                disabled={!url.trim() || isImporting}
                className="w-full"
              >
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Detect and import
              </Button>
            </div>

            {errorText && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Import failed
                </div>
                <p className="mt-1 text-xs text-destructive/90">{errorText}</p>
              </div>
            )}

            {duplicateTour && (
              <div className="space-y-3 rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <div>
                  <p className="font-medium">Existing tour uses this booking link.</p>
                  <p className="mt-1 truncate" title={duplicateTour.title}>
                    {duplicateTour.title}
                  </p>
                  <a
                    href={duplicateTour.bookingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs underline"
                  >
                    Booking link
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {duplicateAlreadyLinked ? (
                  <div className="rounded-md border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                    <div className="flex items-center gap-2 font-medium">
                      <Check className="h-4 w-4" />
                      Already linked to {locationName}.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => linkTourIdToLocation(duplicateTour.id)}
                      disabled={isLinking || detailQuery.isLoading}
                    >
                      {isLinking && pendingLinkTourId === duplicateTour.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}
                      Link existing tour
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={importAnyway}>
                      Import anyway
                    </Button>
                  </div>
                )}

                {linkErrorMessage && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                    <p className="text-xs font-medium text-destructive">{linkErrorMessage}</p>
                    {pendingLinkTourId == null && duplicateTour && !duplicateAlreadyLinked && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => linkTourIdToLocation(duplicateTour.id)}
                      >
                        Retry link
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {!duplicateTour && linkErrorMessage && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                <p className="text-xs font-medium text-destructive">{linkErrorMessage}</p>
                <p className="mt-1 text-[11px] text-destructive/80">
                  The tour was created. Open the attraction's edit page to link it manually.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {draft && (
        <TourFormDialog
          open={formOpen}
          onOpenChange={(next) => {
            setFormOpen(next);
            if (!next && !linkInFlight) {
              // Form closed without a create (Cancel) — close the whole quick-add too.
              handleOpenChange(false);
            }
          }}
          importDraft={draft}
          prefilledLocationKey={locationKey}
          onCreated={handleCreatedTour}
        />
      )}
    </>
  );
}
