import type { UseFormReturn } from "react-hook-form";
import { RefreshCw } from "lucide-react";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Button } from "@client/components/ui/button";
import type { AddAccommodationsFormData } from "../../../validation/add-accommodations.schema";

interface EditLookupSectionProps {
  form: UseFormReturn<AddAccommodationsFormData>;
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
  const { register, formState } = form;
  const { errors } = formState;

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-background/20 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Step 1 + Entities</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onGooglePrefill}
          disabled={isPrefillingGoogle || isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isPrefillingGoogle ? "animate-spin" : ""}`} />
          {isPrefillingGoogle ? "Refreshing..." : "Google Re-Prefill"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input placeholder="Location Name" {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Title</Label>
          <Input placeholder="Display title (listings, CMS)" {...register("title")} />
          <p className="text-[11px] text-muted-foreground">
            Public display name. Can differ from the maps/source name above.
          </p>
          {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Address</Label>
          <Input placeholder="Location Address" {...register("address")} />
          {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Google URL</Label>
          <Input placeholder="https://www.google.com/maps/..." {...register("googleUrl")} />
          {errors.googleUrl && <p className="text-xs text-destructive">{errors.googleUrl.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Place ID</Label>
          <Input placeholder="ChIJ..." {...register("placeId")} />
          {errors.placeId && <p className="text-xs text-destructive">{errors.placeId.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Latitude</Label>
          <Input placeholder="25.7743" {...register("latitude")} />
          {errors.latitude && <p className="text-xs text-destructive">{errors.latitude.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Longitude</Label>
          <Input placeholder="-80.1937" {...register("longitude")} />
          {errors.longitude && <p className="text-xs text-destructive">{errors.longitude.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Time Zone (IANA)</Label>
          <Input placeholder="America/New_York" {...register("ianaTimeId")} />
          {errors.ianaTimeId && <p className="text-xs text-destructive">{errors.ianaTimeId.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>District</Label>
          <Input placeholder="Financial District" {...register("district")} />
          {errors.district && <p className="text-xs text-destructive">{errors.district.message}</p>}
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Location Key</Label>
          <Input placeholder="united-states|miami|financial-district" {...register("locationKey")} />
          {errors.locationKey && <p className="text-xs text-destructive">{errors.locationKey.message}</p>}
        </div>
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
          Name or address changed after lookup. Run Google Re-Prefill to refresh Place ID and coordinates.
        </div>
      )}
    </section>
  );
}
