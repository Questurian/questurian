import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import type { DiningReviewFieldsProps } from "./add-dining-staged-form.types";

export function DiningPublicDetailsFields({ form }: Pick<DiningReviewFieldsProps, "form">) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold tracking-tight text-foreground">Public details</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label>Display title</Label>
          <Input placeholder="Public-facing title" {...form.register("title")} />
          {form.formState.errors.title && (
            <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Phone number (optional)</Label>
          <Input placeholder="+51 1 555 5555" {...form.register("phoneNumber")} />
          {form.formState.errors.phoneNumber && (
            <p className="text-xs text-destructive">{form.formState.errors.phoneNumber.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Website</Label>
          <Input placeholder="https://example.com" {...form.register("website")} />
          {form.formState.errors.website && (
            <p className="text-xs text-destructive">{form.formState.errors.website.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
