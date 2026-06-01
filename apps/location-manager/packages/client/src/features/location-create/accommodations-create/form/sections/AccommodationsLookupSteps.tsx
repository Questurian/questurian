import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { PRICE_OPTIONS } from "../../../constants/accommodations-options";
import type { AddAccommodationsFormData } from "../../../validation/add-accommodations.schema";
import { AutoFillEvidencePanel } from "../../suggestions/AccommodationsSuggestionOverlays";
import { CORE_SUGGESTION_FIELDS } from "../../suggestions/accommodations-suggestion-utils";
import { FieldLabel, OptionSelect, SectionHeader } from "../AccommodationsFieldControls";
import type { AccommodationsFormSectionsProps } from "../AccommodationsForm";

export function AccommodationsLookupSteps(props: AccommodationsFormSectionsProps) {
  const {
    activeSection, aiSuggestionEvidence, canRunGooglePrefill, coreComplete, entitiesComplete,
    form, getCanSuggestField, goToNextSection, goToPreviousSection, handleClearExceptStep1,
    handleGooglePrefill, isAiSuggested, isApiFilled, isLoadingTypes, isManuallySelected,
    isPrefillReady, isPrefillingGoogle, isSectionPending, locationTypes,
    pendingFields, prefillError, prefillIsStale, prefillMessage, queueSuggestion,
    setSingleOptionField, stepOneComplete, suggestAllFields,
  } = props;

  return <>
      {activeSection === "step1" && (
        <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
          <SectionHeader title="Step 1" isComplete={stepOneComplete} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="Location Name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input placeholder="Location Address" {...form.register("address")} />
              {form.formState.errors.address && (
                <p className="text-xs text-destructive">{form.formState.errors.address.message}</p>
              )}
            </div>
          </div>

          <div className="flex justify-between border-t border-border/70 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClearExceptStep1}
            >
              Clear All Except Step 1
            </Button>
            <Button
              type="button"
              onClick={() => void handleGooglePrefill()}
              disabled={!canRunGooglePrefill}
            >
              {isPrefillingGoogle
                ? "Continuing..."
                : isPrefillReady
                  ? "Lookup Complete"
                  : prefillIsStale
                    ? "Refresh Lookup"
                    : "Continue"}
            </Button>
          </div>

          {prefillMessage && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              {prefillMessage}
            </div>
          )}

          {prefillError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {prefillError}
            </div>
          )}

          {prefillIsStale && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
              Name or address changed after lookup. Run Google lookup again to refresh Place ID and coordinates.
            </div>
          )}

          <AutoFillEvidencePanel evidence={aiSuggestionEvidence} />
        </section>
      )}

      {isPrefillReady && activeSection === "entities" && (
        <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
          <SectionHeader title="Entities Fields (Optional Manual Overrides)" isComplete={entitiesComplete} />
          <AutoFillEvidencePanel evidence={aiSuggestionEvidence} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FieldLabel apiFilled={isApiFilled("googleUrl")}>Google URL</FieldLabel>
              <Input placeholder="https://www.google.com/maps/..." {...form.register("googleUrl")} />
              {form.formState.errors.googleUrl && (
                <p className="text-xs text-destructive">{form.formState.errors.googleUrl.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel apiFilled={isApiFilled("placeId")}>Place ID</FieldLabel>
              <Input placeholder="ChIJ..." {...form.register("placeId")} />
              {form.formState.errors.placeId && (
                <p className="text-xs text-destructive">{form.formState.errors.placeId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel apiFilled={isApiFilled("latitude")}>Latitude</FieldLabel>
              <Input placeholder="25.7743" {...form.register("latitude")} />
              {form.formState.errors.latitude && (
                <p className="text-xs text-destructive">{form.formState.errors.latitude.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel apiFilled={isApiFilled("longitude")}>Longitude</FieldLabel>
              <Input placeholder="-80.1937" {...form.register("longitude")} />
              {form.formState.errors.longitude && (
                <p className="text-xs text-destructive">{form.formState.errors.longitude.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel apiFilled={isApiFilled("ianaTimeId")}>Time Zone (IANA)</FieldLabel>
              <Input placeholder="America/New_York" {...form.register("ianaTimeId")} />
              {form.formState.errors.ianaTimeId && (
                <p className="text-xs text-destructive">{form.formState.errors.ianaTimeId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel apiFilled={isApiFilled("district")}>District</FieldLabel>
              <Input placeholder="Financial District" {...form.register("district")} />
              {form.formState.errors.district && (
                <p className="text-xs text-destructive">{form.formState.errors.district.message}</p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <FieldLabel apiFilled={isApiFilled("locationKey")}>Location Key</FieldLabel>
              <Input placeholder="united-states|miami|financial-district" {...form.register("locationKey")} />
              {form.formState.errors.locationKey && (
                <p className="text-xs text-destructive">{form.formState.errors.locationKey.message}</p>
              )}
            </div>
          </div>
          <div className="flex justify-between border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={goToPreviousSection}>
              Previous
            </Button>
            <Button type="button" onClick={goToNextSection}>
              Next
            </Button>
          </div>
        </section>
      )}

      {isPrefillReady && activeSection === "core" && (
        <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
          <SectionHeader
            title="Core"
            isComplete={coreComplete}
            canSuggestAll={CORE_SUGGESTION_FIELDS.some((f) => getCanSuggestField(f))}
            isSuggestingAll={isSectionPending(CORE_SUGGESTION_FIELDS)}
            onSuggestAll={() => suggestAllFields(CORE_SUGGESTION_FIELDS)}
          />
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <FieldLabel
                aiSuggested={isAiSuggested("type")}
                manuallySelected={isManuallySelected("type")}
                canSuggest={getCanSuggestField("type")}
                isSuggesting={pendingFields.has("type")}
                onSuggest={() => void queueSuggestion("type")}
              >
                Type
              </FieldLabel>
              <select
                value={form.watch("type") || ""}
                onChange={(event) => setSingleOptionField("type", event.target.value)}
                disabled={isLoadingTypes}
                className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
              >
                <option value="">
                  {isLoadingTypes ? "Loading types..." : "Select a type"}
                </option>
                {locationTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {form.formState.errors.type && (
                <p className="text-xs text-destructive">{form.formState.errors.type.message}</p>
              )}
            </div>
            <OptionSelect
              label="Price"
              options={PRICE_OPTIONS}
              value={form.watch("price")}
              onChange={(value) =>
                setSingleOptionField("price", value as AddAccommodationsFormData["price"])
              }
              error={form.formState.errors.price?.message}
              apiFilled={isApiFilled("price")}
              aiSuggested={isAiSuggested("price")}
              manuallySelected={isManuallySelected("price")}
              canSuggest={getCanSuggestField("price")}
              isSuggesting={pendingFields.has("price")}
              onSuggest={() => void queueSuggestion("price")}
            />
          </div>
          <div className="flex justify-between border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={goToPreviousSection}>
              Previous
            </Button>
            <Button type="button" onClick={goToNextSection}>
              Next
            </Button>
          </div>
        </section>
      )}

  </>;
}
