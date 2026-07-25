import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import type { DiningReviewFieldsProps } from "./add-dining-staged-form.types";

export function DiningPlaceIdentityFields({ form }: Pick<DiningReviewFieldsProps, "form">) {
  return (
    <details className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        Place identity (Google) — expand to edit
      </summary>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
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
    </details>
  );
}
