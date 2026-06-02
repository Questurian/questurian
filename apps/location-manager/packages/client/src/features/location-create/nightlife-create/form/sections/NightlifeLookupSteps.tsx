import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import { useNightlifeForm } from "../NightlifeFormContext";
import { NightlifeSectionHeader } from "../NightlifeFieldControls";
import type { NightlifeFormState } from "../nightlife-form.types";

export function NightlifeLookupSteps() {
  const {
    activeSection,
    entitiesComplete,
    form,
    goToNextSection,
    goToPreviousSection,
    handleGooglePrefill,
    isPending,
    isPrefillReady,
    isPrefillingGoogle,
    prefillError,
    prefillIsStale,
    prefillMessage,
    stepOneComplete,
  } = useNightlifeForm();
  return <>
    {activeSection === "step1" && <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
      <NightlifeSectionHeader title="Step 1" isComplete={stepOneComplete} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Name</Label><Input placeholder="Location Name" {...form.register("name")} />{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
        <div className="space-y-2"><Label>Address</Label><Input placeholder="Location Address" {...form.register("location")} />{form.formState.errors.location && <p className="text-xs text-destructive">{form.formState.errors.location.message}</p>}</div>
      </div>
      <div className="flex justify-end border-t border-border/70 pt-4"><Button type="button" onClick={() => void handleGooglePrefill()} disabled={isPrefillingGoogle || isPending}>{isPrefillingGoogle ? "Continuing..." : "Continue"}</Button></div>
      {prefillMessage && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">{prefillMessage}</div>}
      {prefillError && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{prefillError}</div>}
      {prefillIsStale && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">Name or address changed after lookup. Run Google lookup again to refresh Place ID and coordinates.</div>}
    </section>}
    {isPrefillReady && activeSection === "entities" && <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
      <NightlifeSectionHeader title="Entities Fields (Optional Manual Overrides)" isComplete={entitiesComplete} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField label="Google URL" placeholder="https://www.google.com/maps/..." field="googleUrl" form={form} />
        <TextField label="Place ID" placeholder="ChIJ..." field="placeId" form={form} />
        <TextField label="Latitude" placeholder="-12.0464" field="latitude" form={form} />
        <TextField label="Longitude" placeholder="-77.0428" field="longitude" form={form} />
        <TextField label="Time Zone (IANA)" placeholder="America/Lima" field="ianaTimeId" form={form} />
        <TextField label="District" placeholder="Miraflores" field="district" form={form} />
        <TextField label="Location Key" placeholder="peru|lima|miraflores" field="locationKey" form={form} className="md:col-span-2" />
      </div>
      <StepButtons onPrevious={goToPreviousSection} onNext={goToNextSection} />
    </section>}
  </>;
}

function TextField({ label, placeholder, field, form, className = "" }: { label: string; placeholder: string; field: "googleUrl" | "placeId" | "latitude" | "longitude" | "ianaTimeId" | "district" | "locationKey"; form: NightlifeFormState["form"]; className?: string }) {
  const error = form.formState.errors[field];
  return <div className={`space-y-2 ${className}`}><Label>{label}</Label><Input placeholder={placeholder} {...form.register(field)} />{error && <p className="text-xs text-destructive">{error.message}</p>}</div>;
}

function StepButtons({ onPrevious, onNext }: { onPrevious: () => void; onNext: () => Promise<void> }) {
  return <div className="flex justify-between border-t border-border/70 pt-4"><Button type="button" variant="outline" onClick={onPrevious}>Previous</Button><Button type="button" onClick={() => void onNext()}>Next</Button></div>;
}
