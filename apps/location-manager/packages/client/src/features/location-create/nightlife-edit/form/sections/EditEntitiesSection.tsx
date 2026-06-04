import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import type { UseFormReturn } from "react-hook-form";
import type { EditNightlifeFormData } from "../../nightlife-edit.types";

type EntityField =
  | "googleUrl"
  | "placeId"
  | "latitude"
  | "longitude"
  | "ianaTimeId"
  | "district"
  | "locationKey";

export function EditEntitiesSection({ form }: { form: UseFormReturn<EditNightlifeFormData> }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold tracking-wide text-foreground">Entities Table</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EntityTextField
          form={form}
          field="googleUrl"
          label="Google URL"
          placeholder="https://www.google.com/maps/..."
          disabled
          description="Reference-only in edit mode."
        />
        <EntityTextField form={form} field="placeId" label="Place ID" placeholder="ChIJ..." />
        <EntityTextField
          form={form}
          field="latitude"
          label="Latitude"
          placeholder="-12.0464"
          disabled
          description="Coordinates are locked on edit."
        />
        <EntityTextField form={form} field="longitude" label="Longitude" placeholder="-77.0428" disabled />
        <EntityTextField form={form} field="ianaTimeId" label="Time Zone (IANA)" placeholder="America/Lima" />
        <EntityTextField form={form} field="district" label="District" placeholder="Miraflores" />
        <EntityTextField
          form={form}
          field="locationKey"
          label="Location Key"
          placeholder="peru|lima|miraflores"
          className="md:col-span-2"
        />
      </div>
    </section>
  );
}

function EntityTextField({
  form,
  field,
  label,
  placeholder,
  className = "",
  disabled = false,
  description,
}: {
  form: UseFormReturn<EditNightlifeFormData>;
  field: EntityField;
  label: string;
  placeholder: string;
  className?: string;
  disabled?: boolean;
  description?: string;
}) {
  const error = form.formState.errors[field];
  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>
      <Input placeholder={placeholder} {...form.register(field)} disabled={disabled} />
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {error && <p className="text-xs text-destructive">{error.message}</p>}
    </div>
  );
}
