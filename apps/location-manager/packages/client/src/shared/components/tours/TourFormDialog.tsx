import { useEffect, useState } from "react";
import { Button, Input, Label } from "@client/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { ErrorBoundary } from "@client/shared/components/ErrorBoundary";
import type { Tour, TourDraftPreview } from "@client/shared/services/api/types";
import { Loader2 } from "lucide-react";
import { MediaSetPicker } from "./MediaSetPicker";
import { TourImageUploadPanel } from "./TourImageUploadPanel";
import type { TourFormDialogProps } from "./TourFormDialog.types";
import { useTourFormDraft } from "./hooks/useTourFormDraft";

interface TourFormDialogContentProps {
  onOpenChange: (open: boolean) => void;
  tour?: Tour | null;
  initialMediaSetId?: string;
  onMediaSetIdPersist?: (id: string) => void;
  importDraft?: TourDraftPreview | null;
  prefilledLocationKey?: string | null;
  onCreated?: (tour: Tour) => void;
}

function TourFormDialogContent({
  onOpenChange,
  tour = null,
  initialMediaSetId = "",
  onMediaSetIdPersist,
  importDraft = null,
  prefilledLocationKey = null,
  onCreated,
}: TourFormDialogContentProps) {
  const form = useTourFormDraft({
    onOpenChange,
    tour,
    initialMediaSetId,
    onMediaSetIdPersist,
    importDraft,
    prefilledLocationKey,
    onCreated,
  });
  const isEditing = Boolean(tour);

  return (
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-x-hidden overflow-y-auto p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit Tour" : "New Tour"}</DialogTitle>
        <DialogDescription>
          Optional <span className="font-medium text-foreground">Place / geography</span> sets the Payload{" "}
          <code className="text-foreground/90">locations</code> relationship for site organization (same pipe
          key as venues). Tours still attach to attractions separately. Use{" "}
          <span className="font-medium text-foreground">Sync to Payload</span> on the Tours list to push
          updates to Questura.
        </DialogDescription>
      </DialogHeader>

      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label>Display title</Label>
            {form.draft.sourceTitle && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.suggestTitleMutation.isPending}
                onClick={() => form.suggestTitle(importDraft?.description, importDraft?.duration)}
              >
                {form.suggestTitleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                AI title
              </Button>
            )}
          </div>
          <Input
            value={form.draft.title}
            onChange={(event) => form.updateDraft({ title: event.target.value })}
            placeholder="Sacred Valley Day Tour"
          />
          {form.draft.sourceTitle && (
            <p className="text-xs text-muted-foreground">
              Source title: <span className="font-medium text-foreground">{form.draft.sourceTitle}</span>
            </p>
          )}
        </div>

        <MediaSetPicker
          value={form.draft.imgPayloadMediaSetId}
          onChange={(value) => form.updateDraft({ imgPayloadMediaSetId: value })}
        />

        <TourImageUploadPanel
          title={form.draft.title}
          sourceImageUrl={form.draft.sourceImageUrl || null}
          sourceProvider={form.draft.sourceProvider || null}
          onUploaded={(mediaSetId) => form.updateDraft({ imgPayloadMediaSetId: mediaSetId })}
          onLocalImageStateChange={form.setHasPendingLocalImage}
          onUploadPendingChange={form.setIsImageUploadPending}
        />

        <div className="space-y-2">
          <Label>Booking link</Label>
          <Input
            value={form.draft.bookingLink}
            onChange={(event) => form.updateDraft({ bookingLink: event.target.value })}
            placeholder="https://example.com/book"
          />
        </div>

        <div className="space-y-2">
          <Label>Price</Label>
          <Input
            value={form.draft.price}
            onChange={(event) => form.updateDraft({ price: event.target.value })}
            placeholder="From $45"
          />
        </div>

        <div className="space-y-2">
          <Label>Place / geography (optional)</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              value={form.selectedCountry}
              onChange={(event) => form.handleCountryChange(event.target.value)}
              disabled={form.isLoadingCountries}
              className="h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
            >
              <option value="">{form.isLoadingCountries ? "Loading…" : "Country"}</option>
              {form.countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label}
                </option>
              ))}
            </select>
            <select
              value={form.selectedCity}
              onChange={(event) => form.handleCityChange(event.target.value)}
              disabled={!form.selectedCountry || form.cities.length === 0}
              className="h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground disabled:opacity-50"
            >
              <option value="">City</option>
              {form.cities.map((city) => (
                <option key={city.value} value={city.value}>
                  {city.label}
                </option>
              ))}
            </select>
            <select
              value={form.selectedNeighborhood}
              onChange={(event) => form.handleNeighborhoodChange(event.target.value)}
              disabled={!form.selectedCity || form.neighborhoods.length === 0}
              className="h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground disabled:opacity-50"
            >
              <option value="">Neighborhood</option>
              {form.neighborhoods.map((neighborhood) => (
                <option key={neighborhood.value} value={neighborhood.value}>
                  {neighborhood.label}
                </option>
              ))}
            </select>
          </div>
          {form.draft.locationKey ? (
            <p className="text-xs text-muted-foreground font-mono">{form.draft.locationKey}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Maps to Questura <code className="text-foreground/90">tours.locationRef</code> after sync.
            </p>
          )}
        </div>

        {(form.formError || form.createTourMutation.error || form.updateTourMutation.error) && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
            <p className="text-sm font-medium text-destructive">
              {form.formError ||
                form.createTourMutation.error?.message ||
                form.updateTourMutation.error?.message}
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={form.saveDraft} disabled={form.isSaving}>
            {form.isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {form.isImageUploadPending ? "Uploading image..." : "Save tour"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export function TourFormDialog({
  open,
  onOpenChange,
  tour = null,
  importDraft = null,
  prefilledLocationKey = null,
  onCreated,
}: TourFormDialogProps) {
  const baseKey = tour ? `tour-${tour.id}` : importDraft ? `import-${importDraft.sourceUrl}` : "new-tour";
  const [persistedMediaSetId, setPersistedMediaSetId] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const contentKey = `${baseKey}-${resetCount}`;

  useEffect(() => {
    if (!open) {
      setPersistedMediaSetId("");
      setResetCount(0);
    }
  }, [open]);

  function handleTryAgain() {
    setResetCount((count) => count + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ErrorBoundary
          key={contentKey}
          fallback={() => (
            <DialogContent className="max-w-md p-6">
              <DialogHeader>
                <DialogTitle>Something went wrong</DialogTitle>
                <DialogDescription>
                  {persistedMediaSetId
                    ? "Your image was uploaded. Click \"Try again\" — the form will reopen with the image already selected."
                    : "An error occurred inside this dialog. Your upload may have completed — check the media set list before retrying."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button type="button" onClick={handleTryAgain}>
                  Try again
                </Button>
              </div>
            </DialogContent>
          )}
        >
          <TourFormDialogContent
            key={contentKey}
            onOpenChange={onOpenChange}
            tour={tour}
            importDraft={importDraft}
            initialMediaSetId={persistedMediaSetId}
            onMediaSetIdPersist={setPersistedMediaSetId}
            prefilledLocationKey={prefilledLocationKey}
            onCreated={onCreated}
          />
        </ErrorBoundary>
      )}
    </Dialog>
  );
}
