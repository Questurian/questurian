import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { PhotoImportPhase } from "../../../components/PhotoImportPhase";
import { liftAiUrlAckOnUserEdit, setAiUrlAcknowledged } from "../../../autofill/ai-url-ack";
import { WALKABILITY_OPTIONS } from "../../../constants/accommodations-options";
import type { AddAccommodationsFormData } from "../../../validation/add-accommodations.schema";
import { DETAILS_SUGGESTION_FIELDS } from "../../suggestions/accommodations-suggestion-utils";
import { AiSuggestedBadge, FieldLabel, OptionSelect, SectionHeader } from "../AccommodationsFieldControls";
import type { AccommodationsFormSectionsProps } from "../AccommodationsForm";
import { useGooglePhotoImportEnabled } from "@client/shared/services/api/hooks";

export function AccommodationsCompletionSteps(props: AccommodationsFormSectionsProps) {
  const {
    activeSection, aiSuggestedFields, createDisabledReason, detailsComplete, error, form,
    getCanSuggestField, goToNextSection, goToPreviousSection, isAiSuggested, isApiFilled,
    isCreatingWithPhotos, isPending, isPrefillReady, isSectionPending, pendingFields,
    photoCount, photoReady, photoSubmitError, queueSuggestion, selectedCount,
    setAiSuggestedFields, setPhotoSession, setSingleOptionField, setVerifiedAiUrls,
    suggestAllFields, verifiedAiUrls, isManuallySelected,
  } = props;
  const { enabled: photoImportEnabled } = useGooglePhotoImportEnabled();

  const createControls = (
    <div className="flex flex-col items-end gap-2">
      {createDisabledReason && (
        <p className="max-w-md text-right text-xs text-muted-foreground">
          {createDisabledReason}
        </p>
      )}
      {photoSubmitError && (
        <p className="max-w-md text-right text-xs text-destructive">
          {photoSubmitError.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={
          Boolean(createDisabledReason) ||
          isPending ||
          isCreatingWithPhotos ||
          (selectedCount > 0 && !photoReady)
        }
        title={
          selectedCount > 0 && !photoReady
            ? `${photoCount} of ${selectedCount} photos cropped — finish each crop before Create`
            : undefined
        }
      >
        {isPending || isCreatingWithPhotos
          ? "Creating..."
          : selectedCount === 0
            ? "Create Accommodations Document"
            : photoReady
              ? `Create with ${photoCount} photo${photoCount === 1 ? "" : "s"}`
              : `Crop ${selectedCount - photoCount} more to enable Create`}
      </Button>
    </div>
  );

  return <>
      {isPrefillReady && activeSection === "details" && (
        <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
          <SectionHeader
            title="The Details"
            isComplete={detailsComplete}
            canSuggestAll={DETAILS_SUGGESTION_FIELDS.some((f) => getCanSuggestField(f))}
            isSuggestingAll={isSectionPending(DETAILS_SUGGESTION_FIELDS)}
            onSuggestAll={() => suggestAllFields(DETAILS_SUGGESTION_FIELDS)}
          />
          <OptionSelect
            label="Walkability"
            options={WALKABILITY_OPTIONS}
            value={form.watch("walkability")}
            onChange={(value) =>
              setSingleOptionField("walkability", value as AddAccommodationsFormData["walkability"])
            }
            error={form.formState.errors.walkability?.message}
            aiSuggested={isAiSuggested("walkability")}
            manuallySelected={isManuallySelected("walkability")}
            canSuggest={getCanSuggestField("walkability")}
            isSuggesting={pendingFields.has("walkability")}
            onSuggest={() => void queueSuggestion("walkability")}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FieldLabel
                aiSuggested={isAiSuggested("checkInTime")}
                canSuggest={getCanSuggestField("checkInTime")}
                isSuggesting={pendingFields.has("checkInTime")}
                onSuggest={() => void queueSuggestion("checkInTime")}
              >
                Check-In Time
              </FieldLabel>
              <Input
                type="time"
                value={form.watch("checkInTime")}
                onChange={(event) =>
                  setSingleOptionField(
                    "checkInTime",
                    event.target.value as AddAccommodationsFormData["checkInTime"]
                  )
                }
              />
              {form.formState.errors.checkInTime && (
                <p className="text-xs text-destructive">{form.formState.errors.checkInTime.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel
                aiSuggested={isAiSuggested("checkOutTime")}
                canSuggest={getCanSuggestField("checkOutTime")}
                isSuggesting={pendingFields.has("checkOutTime")}
                onSuggest={() => void queueSuggestion("checkOutTime")}
              >
                Check-Out Time
              </FieldLabel>
              <Input
                type="time"
                value={form.watch("checkOutTime")}
                onChange={(event) =>
                  setSingleOptionField(
                    "checkOutTime",
                    event.target.value as AddAccommodationsFormData["checkOutTime"]
                  )
                }
              />
              {form.formState.errors.checkOutTime && (
                <p className="text-xs text-destructive">{form.formState.errors.checkOutTime.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel apiFilled={isApiFilled("phone")}>Phone</FieldLabel>
              <Input
                placeholder="+1 (555) 700-1200"
                disabled={form.watch("phoneNotAvailable")}
                {...form.register("phone")}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.watch("phoneNotAvailable")}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    form.setValue("phoneNotAvailable", checked, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                    if (checked) {
                      form.setValue("phone", "", { shouldValidate: true, shouldDirty: true });
                    }
                  }}
                />
                Phone not available
              </label>
              {form.formState.errors.phone && (
                <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel apiFilled={isApiFilled("websiteUrl")}>Website URL</FieldLabel>
              <Input placeholder="https://example.com/hotel" {...form.register("websiteUrl")} />
              {form.formState.errors.websiteUrl && (
                <p className="text-xs text-destructive">{form.formState.errors.websiteUrl.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Booking URL</Label>
                {isAiSuggested("bookingUrl") && <AiSuggestedBadge />}
              </div>
              <Input
                placeholder="https://example.com/hotel/book"
                {...form.register("bookingUrl", {
                  onChange: () => {
                    if (aiSuggestedFields.has("bookingUrl")) {
                      setAiSuggestedFields((prev) => {
                        const next = new Set(prev);
                        next.delete("bookingUrl");
                        return next;
                      });
                      setVerifiedAiUrls((prev) => liftAiUrlAckOnUserEdit(prev, "bookingUrl"));
                    }
                  },
                })}
              />
              {form.formState.errors.bookingUrl && (
                <p className="text-xs text-destructive">{form.formState.errors.bookingUrl.message}</p>
              )}
              {isAiSuggested("bookingUrl") && Boolean(form.watch("bookingUrl")) && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={verifiedAiUrls.bookingUrl}
                    onChange={(event) =>
                      setVerifiedAiUrls((prev) => setAiUrlAcknowledged(prev, "bookingUrl", event.target.checked))
                    }
                  />
                  I verified this booking URL works.
                </label>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel apiFilled={isApiFilled("googleMapsUrl")}>Google Maps URL</FieldLabel>
              <Input placeholder="https://maps.google.com/..." {...form.register("googleMapsUrl")} />
              {form.formState.errors.googleMapsUrl && (
                <p className="text-xs text-destructive">{form.formState.errors.googleMapsUrl.message}</p>
              )}
            </div>
          </div>
          <div className="flex justify-between border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={goToPreviousSection}>
              Previous
            </Button>
            {photoImportEnabled ? (
              <Button type="button" onClick={goToNextSection}>
                Next
              </Button>
            ) : (
              createControls
            )}
          </div>
        </section>
      )}

      {isPrefillReady && photoImportEnabled && activeSection === "photos" && (
        <section className="space-y-5">
          <PhotoImportPhase
            placeId={form.watch("placeId") || null}
            category="accommodations"
            onSessionChange={setPhotoSession}
          />
          <div className="flex justify-between border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={goToPreviousSection}>
              Previous
            </Button>
            {createControls}
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error: {error.message}
        </div>
      )}

  </>;
}
