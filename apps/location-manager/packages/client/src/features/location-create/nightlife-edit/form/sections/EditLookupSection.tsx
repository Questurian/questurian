import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import type { UseFormReturn } from "react-hook-form";
import type { EditNightlifeFormData } from "../../nightlife-edit.types";

interface EditLookupSectionProps {
  form: UseFormReturn<EditNightlifeFormData>;
  isPrefillingGoogle: boolean;
  isPending: boolean;
  prefillMessage: string | null;
  prefillError: string | null;
  prefillIsStale: boolean;
  onGooglePrefill: () => void;
}

export function EditLookupSection({
  form,
  isPrefillingGoogle,
  isPending,
  prefillMessage,
  prefillError,
  prefillIsStale,
  onGooglePrefill,
}: EditLookupSectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold tracking-wide text-foreground">Step 1: Name + Address</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField form={form} field="name" label="Name" placeholder="Nebula" />
        <TextField form={form} field="location" label="Address" placeholder="Av. La Mar 1337, Miraflores, Lima" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onGooglePrefill}
          disabled={isPrefillingGoogle || isPending}
        >
          {isPrefillingGoogle ? "Fetching Google data..." : "Refresh Place ID + Coordinates"}
        </Button>
        <p className="text-xs text-muted-foreground">Optional. Use lookup after changing name or address.</p>
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
  );
}

function TextField({
  form,
  field,
  label,
  placeholder,
}: {
  form: UseFormReturn<EditNightlifeFormData>;
  field: "name" | "location";
  label: string;
  placeholder: string;
}) {
  const error = form.formState.errors[field];
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input placeholder={placeholder} {...form.register(field)} />
      {error && <p className="text-xs text-destructive">{error.message}</p>}
    </div>
  );
}
