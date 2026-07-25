import { Search } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import type { AddDiningFormData } from "../../validation/add-dining.schema";
import { ProcessingCard } from "../ProcessingCard";

interface DiningBasicsSectionProps {
  form: UseFormReturn<AddDiningFormData>;
  isPrefillRunning: boolean;
  aiBatchStep: "google" | "tripadvisor" | "ai" | null;
  isCreating: boolean;
  prefillMessage: string | null;
  prefillError: string | null;
  prefillIsStale: boolean;
  onContinue: () => Promise<void>;
}

export function DiningBasicsSection({
  form,
  isPrefillRunning,
  aiBatchStep,
  isCreating,
  prefillMessage,
  prefillError,
  prefillIsStale,
  onContinue,
}: DiningBasicsSectionProps) {
  if (isPrefillRunning) {
    return (
      <section className="space-y-5">
        <ProcessingCard
          icon={Search}
          title={
            aiBatchStep === "ai"
              ? "Running AI suggestions"
              : aiBatchStep === "tripadvisor"
                ? "Looking up Google + TripAdvisor"
                : "Looking up Google Place data"
          }
          subtitle={
            aiBatchStep === "ai"
              ? "Grounded search is filling type, ideal-for tags, menu URL, and reservation URL. About 10–15 seconds."
              : aiBatchStep === "tripadvisor"
                ? "Pulling Place ID, coordinates, timezone, and TripAdvisor place data. Takes a few seconds."
                : "Pulling Place ID, coordinates, and timezone for this address. Takes a few seconds."
          }
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
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

      <div className="space-y-2">
        <Label>TripAdvisor URL</Label>
        <Input
          placeholder="https://www.tripadvisor.com/Restaurant_Review-g...-d12345-Reviews-..."
          disabled={Boolean(form.watch("noTripadvisorListing"))}
          {...form.register("tripadvisorUrl")}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-foreground"
            {...form.register("noTripadvisorListing")}
            onChange={(event) => {
              form.setValue("noTripadvisorListing", event.target.checked, {
                shouldDirty: true,
                shouldValidate: true,
                shouldTouch: true,
              });
              if (event.target.checked) {
                form.setValue("tripadvisorUrl", "", {
                  shouldDirty: true,
                  shouldValidate: true,
                  shouldTouch: true,
                });
                form.clearErrors("tripadvisorUrl");
              }
            }}
          />
          No TripAdvisor listing for this place
        </label>
        {form.formState.errors.tripadvisorUrl && (
          <p className="text-xs text-destructive">
            {form.formState.errors.tripadvisorUrl.message}
          </p>
        )}
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

      <div className="flex justify-end border-t border-border/70 pt-4">
        <Button type="button" onClick={() => void onContinue()} disabled={isCreating}>
          Continue
        </Button>
      </div>
    </section>
  );
}
