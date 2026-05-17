import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { CheckCircle2, ChevronLeft, UtensilsCrossed } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { FormTagMultiSelect } from "@client/shared/components/forms";
import { getIdealForOptionGroups } from "../constants/ai-prompt-template";
import type { AddDiningFormData } from "../validation/add-dining.schema";
import type { FieldProvenance } from "@questurian/lm-shared";
import { ProvenanceBadge } from "./ProvenanceBadge";

type DiningFormSection = "step1" | "entities" | "classification" | "optional";

const DINING_SECTION_ORDER: DiningFormSection[] = [
  "step1",
  "entities",
  "classification",
  "optional",
];

interface AddDiningStagedFormProps {
  form: UseFormReturn<AddDiningFormData>;
  onSubmit: (data: AddDiningFormData) => void;
  onRunGooglePrefill: () => Promise<boolean>;
  isPrefillingGoogle: boolean;
  isCreating: boolean;
  createError: Error | null;
  prefillMessage: string | null;
  prefillError: string | null;
  prefillIsStale: boolean;
  isPrefillReady: boolean;
  locationTypes: { value: string; label: string }[];
  isLoadingTypes: boolean;
  provenance: Partial<Record<"type" | "tripadvisorUrl" | "menuUrl" | "reservationUrl", FieldProvenance>>;
}

export function AddDiningStagedForm({
  form,
  onSubmit,
  onRunGooglePrefill,
  isPrefillingGoogle,
  isCreating,
  createError,
  prefillMessage,
  prefillError,
  prefillIsStale,
  isPrefillReady,
  locationTypes,
  isLoadingTypes,
  provenance,
}: AddDiningStagedFormProps) {
  const idealForOptionGroups = getIdealForOptionGroups("dining");
  const [activeSection, setActiveSection] = useState<DiningFormSection>("step1");
  const [isAdvancing, setIsAdvancing] = useState(false);

  const hasValue = (value: string | undefined) => Boolean(value && value.trim().length > 0);
  const stepOneComplete = isPrefillReady;
  const entitiesComplete =
    hasValue(form.watch("placeId")) &&
    hasValue(form.watch("latitude")) &&
    hasValue(form.watch("longitude"));
  const classificationComplete = (form.watch("idealFor")?.length ?? 0) > 0;
  const optionalComplete =
    !form.formState.errors.tripadvisorUrl &&
    !form.formState.errors.menuUrl &&
    !form.formState.errors.reservationUrl;

  const flowSections: Array<{
    key: DiningFormSection;
    label: string;
    complete: boolean;
  }> = [
    { key: "step1", label: "Step 1", complete: stepOneComplete },
    { key: "entities", label: "Entities", complete: entitiesComplete },
    { key: "classification", label: "Classification", complete: classificationComplete },
    { key: "optional", label: "Optional", complete: optionalComplete },
  ];

  const canOpenSection = (section: DiningFormSection) => {
    if (section === "step1") return true;
    return isPrefillReady;
  };

  const goToSection = (section: DiningFormSection) => {
    if (!canOpenSection(section)) return;
    setActiveSection(section);
  };

  const goToPreviousSection = () => {
    const currentIndex = DINING_SECTION_ORDER.indexOf(activeSection);
    const previousSection = DINING_SECTION_ORDER[currentIndex - 1];
    if (previousSection) {
      goToSection(previousSection);
    }
  };

  const goToNextSection = async () => {
    const currentIndex = DINING_SECTION_ORDER.indexOf(activeSection);
    const nextSection = DINING_SECTION_ORDER[currentIndex + 1];
    if (!nextSection) return;

    if (activeSection === "entities") {
      const isValid = await form.trigger(["placeId", "latitude", "longitude"]);
      if (!isValid) return;
    }
    if (activeSection === "classification") {
      const isValid = await form.trigger(["idealFor", "type"]);
      if (!isValid) return;
    }
    if (activeSection === "optional") {
      const isValid = await form.trigger(["tripadvisorUrl"]);
      if (!isValid) return;
    }

    goToSection(nextSection);
  };

  useEffect(() => {
    if (!isPrefillReady && activeSection !== "step1") {
      setActiveSection("step1");
    }
  }, [isPrefillReady, activeSection]);

  const handleContinue = async () => {
    setIsAdvancing(true);
    const success = await onRunGooglePrefill();
    if (success) {
      setActiveSection("entities");
    }
    setIsAdvancing(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-6xl rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <UtensilsCrossed className="w-4 h-4 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground underline">
                  Add Dining
                </h1>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="h-9 border-border/80 bg-background/60 px-3 text-foreground hover:bg-accent/70"
              >
                <Link to="/add">
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {flowSections.map((section, index) => {
                const isActive = activeSection === section.key;
                const isDisabled = !canOpenSection(section.key);
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => goToSection(section.key)}
                    disabled={isDisabled}
                    className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-border bg-muted text-foreground"
                        : isDisabled
                          ? "cursor-not-allowed border-border/50 bg-background text-muted-foreground/55"
                          : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <span>{index + 1}.</span>
                    <span>{section.label}</span>
                    {section.complete && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {activeSection === "step1" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Step 1</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input placeholder="Location Name" {...form.register("name")} />
                    {form.formState.errors.name && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.name.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input placeholder="Location Address" {...form.register("address")} />
                    {form.formState.errors.address && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.address.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end border-t border-border/70 pt-4">
                  <Button
                    type="button"
                    onClick={() => void handleContinue()}
                    disabled={isPrefillingGoogle || isAdvancing || isCreating}
                  >
                    {isPrefillingGoogle || isAdvancing ? "Continuing..." : "Continue"}
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
              </section>
            )}

            {isPrefillReady && activeSection === "entities" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Entities Fields (Editable)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Google URL</Label>
                    <Input
                      placeholder="https://www.google.com/maps/..."
                      {...form.register("googleUrl")}
                    />
                    {form.formState.errors.googleUrl && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.googleUrl.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Place ID</Label>
                    <Input placeholder="ChIJ..." {...form.register("placeId")} />
                    {form.formState.errors.placeId && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.placeId.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Latitude</Label>
                    <Input placeholder="-12.0464" {...form.register("latitude")} />
                    {form.formState.errors.latitude && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.latitude.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Longitude</Label>
                    <Input placeholder="-77.0428" {...form.register("longitude")} />
                    {form.formState.errors.longitude && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.longitude.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Time Zone (IANA)</Label>
                    <Input placeholder="America/Lima" {...form.register("ianaTimeId")} />
                    {form.formState.errors.ianaTimeId && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.ianaTimeId.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>District</Label>
                    <Input placeholder="Miraflores" {...form.register("district")} />
                    {form.formState.errors.district && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.district.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Location Key</Label>
                    <Input
                      placeholder="peru|lima|miraflores"
                      {...form.register("locationKey")}
                    />
                    {form.formState.errors.locationKey && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.locationKey.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={() => void goToNextSection()}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "classification" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Classification
                </h2>
                <div className="space-y-2">
                  <Label className="inline-flex items-center gap-2">Type <ProvenanceBadge provenance={provenance.type} /></Label>
                  <select
                    value={form.watch("type") || ""}
                    onChange={(event) =>
                      form.setValue("type", event.target.value, {
                        shouldDirty: true,
                        shouldValidate: true,
                        shouldTouch: true,
                      })
                    }
                    disabled={isLoadingTypes}
                    className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
                  >
                    <option value="">
                      {isLoadingTypes ? "Loading types..." : "Not set"}
                    </option>
                    {locationTypes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <FormTagMultiSelect
                  name="idealFor"
                  label="Ideal For"
                  control={form.control}
                  optionGroups={idealForOptionGroups}
                  maxSelections={4}
                  description="Choose 1 to 4 tags"
                  allowDirectTagArrayInput
                />

                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="button" onClick={() => void goToNextSection()}>
                    Next
                  </Button>
                </div>
              </section>
            )}

            {isPrefillReady && activeSection === "optional" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Optional</h2>
                <div className="space-y-2">
                  <Label className="inline-flex items-center gap-2">TripAdvisor URL <ProvenanceBadge provenance={provenance.tripadvisorUrl} /></Label>
                  <Input
                    placeholder="https://www.tripadvisor.com/..."
                    {...form.register("tripadvisorUrl")}
                  />
                  {form.formState.errors.tripadvisorUrl && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.tripadvisorUrl.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="inline-flex items-center gap-2">Menu URL <ProvenanceBadge provenance={provenance.menuUrl} /></Label>
                    <Input
                      placeholder="https://example.com/menu"
                      {...form.register("menuUrl")}
                    />
                    {form.formState.errors.menuUrl && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.menuUrl.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="inline-flex items-center gap-2">Reservation URL <ProvenanceBadge provenance={provenance.reservationUrl} /></Label>
                    <Input
                      placeholder="https://example.com/reservations"
                      {...form.register("reservationUrl")}
                    />
                    {form.formState.errors.reservationUrl && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.reservationUrl.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button
                    type="submit"
                    disabled={!isPrefillReady || !form.formState.isValid || isCreating}
                  >
                    {isCreating ? "Creating..." : "Create Dining Document"}
                  </Button>
                </div>
              </section>
            )}

            {createError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Error: {createError.message}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
