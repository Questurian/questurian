import type { UseFormReturn } from "react-hook-form";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { TourSelector } from "@client/shared/components/tours/TourSelector";
import type { AddAttractionsFormData } from "../../validation/add-attractions.schema";
import type { AttractionsFormSection } from "./attractionsForm.types";

type Props = {
  activeSection: AttractionsFormSection;
  form: UseFormReturn<AddAttractionsFormData>;
  isPrefillReady: boolean;
  isPrefillingGoogle: boolean;
  isAdvancing: boolean;
  isCreating: boolean;
  prefillMessage: string | null;
  prefillError: string | null;
  prefillIsStale: boolean;
  locationTypes: { value: string; label: string }[];
  isLoadingTypes: boolean;
  onContinue: () => Promise<void>;
  onPrevious: () => void;
  onNext: () => Promise<void>;
};

export function AttractionsPrimarySections({
  activeSection,
  form,
  isPrefillReady,
  isPrefillingGoogle,
  isAdvancing,
  isCreating,
  prefillMessage,
  prefillError,
  prefillIsStale,
  locationTypes,
  isLoadingTypes,
  onContinue: handleContinue,
  onPrevious: goToPreviousSection,
  onNext: goToNextSection,
}: Props) {
  return (
    <>
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
                    <Label>Pricing (optional)</Label>
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
                      <option value="">Not specified</option>
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


    </>
  );
}
