import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { CheckCircle2, ChevronLeft, Clock, Landmark } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { TourSelector } from "@client/shared/components/tours/TourSelector";
import { OperationHoursModal } from "./OperationHoursModal";
import type { AddAttractionsFormData } from "../validation/add-attractions.schema";

type AttractionsFormSection = "step1" | "entities" | "profile" | "tours" | "visitContact";

const ATTRACTIONS_SECTION_ORDER: AttractionsFormSection[] = [
  "step1",
  "entities",
  "profile",
  "tours",
  "visitContact",
];

interface AddAttractionsStagedFormProps {
  form: UseFormReturn<AddAttractionsFormData>;
  onSubmit: (data: AddAttractionsFormData) => void;
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
}

export function AddAttractionsStagedForm({
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
}: AddAttractionsStagedFormProps) {
  const [activeSection, setActiveSection] = useState<AttractionsFormSection>("step1");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [operationHoursModalOpen, setOperationHoursModalOpen] = useState(false);

  const hasValue = (value: string | undefined) => Boolean(value && value.trim().length > 0);
  const stepOneComplete = isPrefillReady;
  const entitiesComplete =
    hasValue(form.watch("placeId")) &&
    hasValue(form.watch("latitude")) &&
    hasValue(form.watch("longitude"));
  const profileComplete =
    hasValue(form.watch("type")) &&
    hasValue(form.watch("priceLevel")) &&
    hasValue(form.watch("bookingRequired"));
  const toursComplete = true;
  const visitContactComplete = hasValue(form.watch("hours"));

  const flowSections: Array<{
    key: AttractionsFormSection;
    label: string;
    complete: boolean;
  }> = [
    { key: "step1", label: "Step 1", complete: stepOneComplete },
    { key: "entities", label: "Entities", complete: entitiesComplete },
    { key: "profile", label: "Profile", complete: profileComplete },
    { key: "tours", label: "Tours", complete: toursComplete },
    { key: "visitContact", label: "Visit & Contact", complete: visitContactComplete },
  ];

  const canOpenSection = (section: AttractionsFormSection) => {
    if (section === "step1") return true;
    return isPrefillReady;
  };

  const goToSection = (section: AttractionsFormSection) => {
    if (!canOpenSection(section)) return;
    setActiveSection(section);
  };

  const goToPreviousSection = () => {
    const currentIndex = ATTRACTIONS_SECTION_ORDER.indexOf(activeSection);
    const previousSection = ATTRACTIONS_SECTION_ORDER[currentIndex - 1];
    if (previousSection) {
      goToSection(previousSection);
    }
  };

  const goToNextSection = async () => {
    const currentIndex = ATTRACTIONS_SECTION_ORDER.indexOf(activeSection);
    const nextSection = ATTRACTIONS_SECTION_ORDER[currentIndex + 1];
    if (!nextSection) return;

    if (activeSection === "entities") {
      const isValid = await form.trigger(["placeId", "latitude", "longitude"]);
      if (!isValid) return;
    }

    if (activeSection === "profile") {
      const isValid = await form.trigger([
        "type",
        "priceLevel",
        "bookingRequired",
      ]);
      if (!isValid) return;
    }

    if (activeSection === "tours") {
      const isValid = await form.trigger(["tourIds"]);
      if (!isValid) return;
    }

    if (activeSection === "visitContact") {
      const isValid = await form.trigger(["hours"]);
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
                  <Landmark className="w-4 h-4 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground underline">
                  Add Attractions
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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Entities Fields (Editable)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Google URL</Label>
                    <Input placeholder="https://www.google.com/maps/..." {...form.register("googleUrl")} />
                    {form.formState.errors.googleUrl && (
                      <p className="text-xs text-destructive">{form.formState.errors.googleUrl.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Place ID</Label>
                    <Input placeholder="ChIJ..." {...form.register("placeId")} />
                    {form.formState.errors.placeId && (
                      <p className="text-xs text-destructive">{form.formState.errors.placeId.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Latitude</Label>
                    <Input placeholder="-12.0464" {...form.register("latitude")} />
                    {form.formState.errors.latitude && (
                      <p className="text-xs text-destructive">{form.formState.errors.latitude.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Longitude</Label>
                    <Input placeholder="-77.0428" {...form.register("longitude")} />
                    {form.formState.errors.longitude && (
                      <p className="text-xs text-destructive">{form.formState.errors.longitude.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Time Zone (IANA)</Label>
                    <Input placeholder="America/Lima" {...form.register("ianaTimeId")} />
                    {form.formState.errors.ianaTimeId && (
                      <p className="text-xs text-destructive">{form.formState.errors.ianaTimeId.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>District</Label>
                    <Input placeholder="Miraflores" {...form.register("district")} />
                    {form.formState.errors.district && (
                      <p className="text-xs text-destructive">{form.formState.errors.district.message}</p>
                    )}
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Location Key</Label>
                    <Input placeholder="peru|lima|miraflores" {...form.register("locationKey")} />
                    {form.formState.errors.locationKey && (
                      <p className="text-xs text-destructive">{form.formState.errors.locationKey.message}</p>
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

            {isPrefillReady && activeSection === "profile" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Profile</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
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
                      <option value="">{isLoadingTypes ? "Loading types..." : "Select type"}</option>
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

                  <div className="space-y-2">
                    <Label>Pricing</Label>
                    <select
                      value={form.watch("priceLevel")}
                      onChange={(event) =>
                        form.setValue("priceLevel", event.target.value as AddAttractionsFormData["priceLevel"], {
                          shouldDirty: true,
                          shouldValidate: true,
                          shouldTouch: true,
                        })
                      }
                      className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
                    >
                      <option value="free">free</option>
                      <option value="$">$</option>
                      <option value="$$">$$</option>
                      <option value="$$$">$$$</option>
                      <option value="$$$$">$$$$</option>
                    </select>
                    {form.formState.errors.priceLevel && (
                      <p className="text-xs text-destructive">{form.formState.errors.priceLevel.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Booking Required</Label>
                    <select
                      value={form.watch("bookingRequired")}
                      onChange={(event) =>
                        form.setValue("bookingRequired", event.target.value as AddAttractionsFormData["bookingRequired"], {
                          shouldDirty: true,
                          shouldValidate: true,
                          shouldTouch: true,
                        })
                      }
                      className="w-full h-10 px-3 text-sm border border-border rounded-md bg-background text-foreground"
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
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

            {isPrefillReady && activeSection === "tours" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Tours</h2>
                <TourSelector
                  selectedTourIds={form.watch("tourIds") ?? []}
                  onChange={(tourIds) =>
                    form.setValue("tourIds", tourIds, {
                      shouldDirty: true,
                      shouldValidate: true,
                      shouldTouch: true,
                    })
                  }
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

            {isPrefillReady && activeSection === "visitContact" && (
              <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Visit & Contact</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Operating Hours</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setOperationHoursModalOpen(true)}
                      >
                        <Clock className="h-4 w-4" />
                        {form.watch("hours") ? "Edit schedule" : "Set schedule"}
                      </Button>
                      {form.watch("hours") && (
                        <span className="text-xs text-muted-foreground">
                          Schedule configured - open modal to edit
                        </span>
                      )}
                    </div>
                    {operationHoursModalOpen && (
                      <OperationHoursModal
                        open={operationHoursModalOpen}
                        onOpenChange={setOperationHoursModalOpen}
                        value={form.watch("hours") ?? ""}
                        onSave={(json) => {
                          form.setValue("hours", json, {
                            shouldDirty: true,
                            shouldValidate: true,
                            shouldTouch: true,
                          });
                        }}
                      />
                    )}
                    {form.formState.errors.hours && (
                      <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Website (optional)</Label>
                    <Input placeholder="https://example.com" {...form.register("website")} />
                    {form.formState.errors.website && (
                      <p className="text-xs text-destructive">{form.formState.errors.website.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Phone (optional)</Label>
                    <Input placeholder="+51 1 461-1312" {...form.register("phone")} />
                    {form.formState.errors.phone && (
                      <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>TripAdvisor URL (optional)</Label>
                  <Input placeholder="https://www.tripadvisor.com/..." {...form.register("tripadvisorUrl")} />
                  {form.formState.errors.tripadvisorUrl && (
                    <p className="text-xs text-destructive">{form.formState.errors.tripadvisorUrl.message}</p>
                  )}
                </div>

                <div className="flex justify-between border-t border-border/70 pt-4">
                  <Button type="button" variant="outline" onClick={goToPreviousSection}>
                    Previous
                  </Button>
                  <Button type="submit" disabled={!isPrefillReady || !form.formState.isValid || isCreating}>
                    {isCreating ? "Creating..." : "Create Attractions Document"}
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
