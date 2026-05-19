import { lazy, Suspense, useState, type ReactNode } from "react";
import { Controller, type Control } from "react-hook-form";
import { Clock, Lock, Unlock } from "lucide-react";
import {
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Button,
} from "@client/components/ui";
import { Skeleton, ErrorAlert, SubmitButton } from "@client/shared/components/ui";
import { FormTagMultiSelect } from "@client/shared/components/forms";
import { TaxonomyLocationEditor } from "@client/shared/components/forms";
import { getIdealForGroups } from "@shared/types/location-ideal-for";
import { DINING_ESTABLISHMENT_TYPE_GROUPS } from "@shared/types/dining-taxonomy";
import { TIMEZONE_OPTIONS } from "../constants/edit-location.constants";
import type { LocationCategory } from "@shared/types/location-category";
import type { FieldProvenance } from "@questurian/lm-shared";
import type { LocationResponse } from "@client/shared/services/api/types/location.types";
import type { EditLocationFormData } from "../validation/edit-location.schema";
import { useLocationDetailForm } from "../hooks/useLocationDetailForm";
import { PendingSuggestionsPanel } from "./PendingSuggestionsPanel";
import { DetailSection, DetailRow, ReadOnlyValue, LinkValue } from "./DetailLayout";

const OperationHoursModal = lazy(() =>
  import("./OperationHoursModal").then((m) => ({ default: m.OperationHoursModal }))
);

interface LocationDetailProps {
  locationId: number;
  category: LocationCategory;
  /** Slot rendered above the card (breadcrumbs in edit, success header in post-create). */
  headerSlot?: ReactNode;
  /** Slot appended after the Save/Cancel footer (e.g. Add Another / Done in post-create). */
  footerSlot?: (ctx: { isDirty: boolean }) => ReactNode;
  /** When true, poll the location every 10s up to 2 min so late Stage-2 suggestions appear live. */
  pollForSuggestions?: boolean;
  /** Called after a successful batch update. Edit mode navigates home; post-create stays. */
  onUpdateSuccess?: () => void;
  /** Empty-state hint shown above the pending-suggestions area when there are none yet. */
  pendingEmptyHint?: ReactNode;
}

export function LocationDetail({
  locationId,
  category,
  headerSlot,
  footerSlot,
  pollForSuggestions = false,
  onUpdateSuccess,
  pendingEmptyHint,
}: LocationDetailProps) {
  const {
    form,
    location,
    isLoading,
    fetchError,
    isPending,
    updateError,
    isLoadingTypes,
    locationTypes,
    operationHoursModalOpen,
    setOperationHoursModalOpen,
    handleSubmit,
    cancelChanges,
  } = useLocationDetailForm({
    locationId,
    category,
    pollForSuggestions,
    onUpdateSuccess,
  });

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto">
        {headerSlot}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-[1200px] mx-auto">
        {headerSlot}
        <ErrorAlert title="Error loading location" message={fetchError.message} />
      </div>
    );
  }

  if (!location) {
    return (
      <div className="max-w-[1200px] mx-auto">
        {headerSlot}
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <p className="text-muted-foreground">Location not found</p>
        </div>
      </div>
    );
  }

  const isDirty = form.formState.isDirty;
  const hasPending =
    location.pendingSuggestions && Object.keys(location.pendingSuggestions).length > 0;

  return (
    <div className="max-w-[1200px] mx-auto">
      {headerSlot}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-6 animate-fade-in-up">
        {hasPending ? (
          <div className="mb-4">
            <PendingSuggestionsPanel
              locationId={location.id}
              category={location.category}
              pending={location.pendingSuggestions}
            />
          </div>
        ) : pendingEmptyHint ? (
          <div className="mb-4 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {pendingEmptyHint}
          </div>
        ) : null}

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <BasicsSection
            form={form}
            location={location}
            locationTypes={locationTypes}
            isLoadingTypes={isLoadingTypes}
          />
          <TaxonomySection form={form} />
          <ContactSection form={form} category={category} />
          <DetailsSection
            form={form}
            category={category}
            location={location}
            operationHoursModalOpen={operationHoursModalOpen}
            setOperationHoursModalOpen={setOperationHoursModalOpen}
          />
          <ExternalLinksSection form={form} location={location} />
          <MediaSection location={location} />

          <div className="space-y-2 pt-2">
            <SubmitButton
              isLoading={isPending}
              submitText="Save Changes"
              submittingText="Saving…"
              disabled={!isDirty}
              className="w-full h-10 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
            />
            <button
              type="button"
              onClick={cancelChanges}
              disabled={!isDirty}
              className="w-full h-10 text-sm font-normal bg-secondary text-secondary-foreground hover:bg-secondary/90 border border-border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel Changes
            </button>
          </div>

          {updateError && <ErrorAlert message={updateError.message} />}

          {footerSlot ? <div className="pt-2 border-t border-border/60">{footerSlot({ isDirty })}</div> : null}
        </form>
      </div>
    </div>
  );
}

// -------- Sections --------

function BasicsSection({
  form,
  location,
  locationTypes,
  isLoadingTypes,
}: {
  form: ReturnType<typeof useLocationDetailForm>["form"];
  location: LocationResponse;
  locationTypes: { value: string; label: string }[];
  isLoadingTypes: boolean;
}) {
  const category = location.category as LocationCategory;
  const typeLabel = category === "dining" ? "Type of Establishment" : "Type";

  return (
    <DetailSection title="Basics">
      <ControlledInputRow
        label="Title"
        name="title"
        control={form.control}
        provenance={fieldProvenance(location.provenance, "title")}
        placeholder="Location title"
      />
      <ControlledInputRow
        label="Name"
        name="name"
        control={form.control}
        placeholder="Location name"
      />
      <DetailRow label="Category">
        <ReadOnlyValue value={location.category} />
      </DetailRow>
      <ControlledSelectRow
        label={typeLabel}
        name="type"
        control={form.control}
        provenance={fieldProvenance(location.provenance, "type")}
        placeholder={isLoadingTypes ? "Loading types..." : "Select a type"}
        disabled={isLoadingTypes}
      >
        {category === "dining"
          ? DINING_ESTABLISHMENT_TYPE_GROUPS.map((group, groupIndex) => (
              <SelectGroup key={group.label}>
                <SelectLabel className="pl-2 pr-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </SelectLabel>
                {group.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {groupIndex < DINING_ESTABLISHMENT_TYPE_GROUPS.length - 1 && <SelectSeparator />}
              </SelectGroup>
            ))
          : locationTypes.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
      </ControlledSelectRow>
      <ControlledInputRow
        label="Address"
        name="address"
        control={form.control}
        placeholder="123 Main St, City, Country"
        description="Coordinates are locked and will not be re-geocoded."
      />
      <ControlledInputRow
        label="District"
        name="district"
        control={form.control}
        placeholder="Neighborhood / district"
      />
      <DetailRow label="Coordinates">
        <ReadOnlyValue value={formatCoords(location.coordinates.lat, location.coordinates.lng)} />
      </DetailRow>
    </DetailSection>
  );
}

function TaxonomySection({
  form,
}: {
  form: ReturnType<typeof useLocationDetailForm>["form"];
}) {
  const locationKey = form.watch("locationKey") || "";
  const district = form.watch("district") || "";
  const [identityUnlocked, setIdentityUnlocked] = useState(false);

  return (
    <DetailSection title="Identity & taxonomy">
      <DetailRow label="Location key" multiline>
        {identityUnlocked ? (
          <div className="space-y-2">
            <TaxonomyLocationEditor
              locationKey={locationKey}
              district={district}
              onLocationKeyChange={(next) =>
                form.setValue("locationKey", next, {
                  shouldDirty: true,
                  shouldValidate: true,
                  shouldTouch: true,
                })
              }
              onDistrictChange={(next) =>
                form.setValue("district", next, {
                  shouldDirty: true,
                  shouldValidate: true,
                  shouldTouch: true,
                })
              }
              locationKeyError={form.formState.errors.locationKey?.message}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => setIdentityUnlocked(false)}
            >
              <Lock className="h-3 w-3" />
              Lock identity
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground/80">{locationKey || <span className="italic text-muted-foreground/60">—</span>}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => setIdentityUnlocked(true)}
            >
              <Unlock className="h-3 w-3" />
              Unlock to edit
            </Button>
          </div>
        )}
      </DetailRow>
      <ControlledInputRow
        label="Country code"
        name="countryCode"
        control={form.control}
        placeholder="PE / CO / BR / AR"
      />
    </DetailSection>
  );
}

function ContactSection({
  form,
  category,
}: {
  form: ReturnType<typeof useLocationDetailForm>["form"];
  category: LocationCategory;
}) {
  return (
    <DetailSection title="Contact">
      <ControlledSelectRow
        label="Time zone (IANA)"
        name="ianaTimeId"
        control={form.control}
        placeholder="Select a time zone"
      >
        {TIMEZONE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </ControlledSelectRow>
      <ControlledInputRow
        label="Phone"
        name="phoneNumber"
        control={form.control}
        placeholder="Phone number"
      />
      <ControlledInputRow
        label="Website"
        name="website"
        control={form.control}
        placeholder="https://…"
      />
      <ControlledInputRow
        label="Email"
        name="email"
        control={form.control}
        placeholder="contact@…"
      />
      {category === "dining" ? (
        <>
          <ControlledInputRow
            label="Menu URL"
            name="menuUrl"
            control={form.control}
            placeholder="https://…"
          />
          <ControlledInputRow
            label="Reservation URL"
            name="reservationUrl"
            control={form.control}
            placeholder="https://…"
          />
        </>
      ) : null}
    </DetailSection>
  );
}

function DetailsSection({
  form,
  category,
  location,
  operationHoursModalOpen,
  setOperationHoursModalOpen,
}: {
  form: ReturnType<typeof useLocationDetailForm>["form"];
  category: LocationCategory;
  location: LocationResponse;
  operationHoursModalOpen: boolean;
  setOperationHoursModalOpen: (open: boolean) => void;
}) {
  const idealForOptionGroups = getIdealForGroups(category).map((group) => ({
    label: group.label,
    options: group.tags.map((tag) => ({ value: tag, label: tag })),
  }));
  const shouldShowIdealFor = category !== "attractions" && idealForOptionGroups.length > 0;
  const idealForProvenance = fieldProvenance(location.provenance, "idealFor");

  return (
    <DetailSection title="Details">
      {shouldShowIdealFor ? (
        <DetailRow
          label="Ideal for"
          multiline
          description="Choose 1 to 4 tags"
          provenance={idealForProvenance}
        >
          <FormTagMultiSelect
            name="idealFor"
            label=""
            control={form.control}
            optionGroups={idealForOptionGroups}
            maxSelections={4}
            allowDirectTagArrayInput
          />
        </DetailRow>
      ) : null}

      <ControlledSelectRow
        label="Price level"
        name="priceLevel"
        control={form.control}
        placeholder="Select price level"
      >
        <SelectItem value="free">free</SelectItem>
        <SelectItem value="$">$</SelectItem>
        <SelectItem value="$$">$$</SelectItem>
        <SelectItem value="$$$">$$$</SelectItem>
        <SelectItem value="$$$$">$$$$</SelectItem>
      </ControlledSelectRow>

      <DetailRow label="Operation hours">
        <div className="flex items-center gap-2 flex-wrap py-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setOperationHoursModalOpen(true)}
          >
            <Clock className="h-4 w-4" />
            {form.watch("operationHours") ? "Edit schedule" : "Set schedule"}
          </Button>
          {form.watch("operationHours") ? (
            <span className="text-xs text-muted-foreground">Schedule configured</span>
          ) : null}
        </div>
        {operationHoursModalOpen ? (
          <Suspense fallback={null}>
            <OperationHoursModal
              open={operationHoursModalOpen}
              onOpenChange={setOperationHoursModalOpen}
              value={form.watch("operationHours") ?? ""}
              onSave={(json) => {
                form.setValue("operationHours", json, { shouldDirty: true });
              }}
            />
          </Suspense>
        ) : null}
      </DetailRow>

      <ControlledTextareaRow
        label="Neighborhood description"
        name="neighborhoodDescription"
        control={form.control}
        placeholder="Short neighborhood description"
        rows={4}
      />

      {category === "key_locations" ? (
        <ControlledTextareaRow
          label="Key locations details (JSON)"
          name="keyLocationsDetails"
          control={form.control}
          placeholder='{"location_type":"airport","status":"active"}'
          description="Structured JSON profile for key locations."
          rows={10}
        />
      ) : null}
    </DetailSection>
  );
}

function ExternalLinksSection({
  form,
  location,
}: {
  form: ReturnType<typeof useLocationDetailForm>["form"];
  location: LocationResponse;
}) {
  return (
    <DetailSection title="External links">
      <DetailRow label="Google URL">
        <ReadOnlyValue value={<LinkValue href={location.contact.url || null} />} />
      </DetailRow>
      <ControlledInputRow
        label="Place ID"
        name="placeId"
        control={form.control}
        placeholder="Google Place ID"
      />
      <ControlledInputRow
        label="TripAdvisor URL"
        name="tripadvisorUrl"
        control={form.control}
        provenance={fieldProvenance(location.provenance, "tripadvisorUrl")}
        placeholder="https://www.tripadvisor.com/…"
      />
      <ControlledTextareaRow
        label="TripAdvisor meal types"
        name="tripadvisorMealTypes"
        control={form.control}
        placeholder="Comma or line-separated (e.g. Lunch, Dinner, Drinks)"
        description="Safety override. Leave blank to keep current value."
        rows={2}
      />
      <ControlledTextareaRow
        label="TripAdvisor cuisines"
        name="tripadvisorCuisines"
        control={form.control}
        placeholder="Comma or line-separated"
        description="Safety override. Leave blank to keep current value."
        rows={2}
      />
    </DetailSection>
  );
}

function MediaSection({ location }: { location: LocationResponse }) {
  return (
    <DetailSection title="Media">
      <DetailRow label="Uploads">
        <ReadOnlyValue value={location.uploads.length} />
      </DetailRow>
      <DetailRow label="Instagram embeds">
        <ReadOnlyValue value={location.instagram_embeds.length} />
      </DetailRow>
    </DetailSection>
  );
}

// -------- Controlled row primitives (Controller + Input) --------

function ControlledInputRow({
  label,
  name,
  control,
  provenance,
  description,
  placeholder,
}: {
  label: string;
  name: keyof EditLocationFormData;
  control: Control<EditLocationFormData>;
  provenance?: FieldProvenance;
  description?: string;
  placeholder?: string;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <DetailRow
          label={label}
          provenance={provenance}
          description={description}
          error={fieldState.error?.message}
        >
          <Input
            id={String(field.name)}
            value={(field.value as string | undefined) ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={placeholder}
            aria-invalid={fieldState.invalid}
            className="h-9"
          />
        </DetailRow>
      )}
    />
  );
}

function ControlledTextareaRow({
  label,
  name,
  control,
  provenance,
  description,
  placeholder,
  rows = 4,
}: {
  label: string;
  name: keyof EditLocationFormData;
  control: Control<EditLocationFormData>;
  provenance?: FieldProvenance;
  description?: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <DetailRow
          label={label}
          provenance={provenance}
          description={description}
          error={fieldState.error?.message}
          multiline
        >
          <Textarea
            id={String(field.name)}
            value={(field.value as string | undefined) ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={placeholder}
            rows={rows}
            aria-invalid={fieldState.invalid}
          />
        </DetailRow>
      )}
    />
  );
}

function ControlledSelectRow({
  label,
  name,
  control,
  provenance,
  placeholder,
  disabled,
  children,
}: {
  label: string;
  name: keyof EditLocationFormData;
  control: Control<EditLocationFormData>;
  provenance?: FieldProvenance;
  placeholder?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const stringValue = (field.value as string | undefined) ?? undefined;
        return (
          <DetailRow label={label} provenance={provenance} error={fieldState.error?.message}>
            {/*
              Radix Select doesn't pick up external value changes once it's been
              mounted as uncontrolled. Re-key on the current value so the Select
              remounts whenever a server-side update (pending-suggestion accept,
              poll refresh) changes the field's value out from under us.
            */}
            <Select
              key={`${name}-${stringValue ?? "unset"}`}
              value={stringValue}
              onValueChange={field.onChange}
              disabled={disabled}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>{children}</SelectContent>
            </Select>
          </DetailRow>
        );
      }}
    />
  );
}

// -------- Helpers --------

function fieldProvenance(
  provenance: Record<string, string> | null,
  field: string
): FieldProvenance | undefined {
  if (!provenance) return undefined;
  const value = provenance[field];
  if (
    value === "google" ||
    value === "tripadvisor" ||
    value === "scraper" ||
    value === "ai" ||
    value === "operator"
  ) {
    return value;
  }
  return undefined;
}

function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}
