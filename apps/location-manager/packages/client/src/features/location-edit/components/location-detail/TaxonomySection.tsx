import { useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { Button } from "@client/components/ui";
import { TaxonomyLocationEditor } from "@client/shared/components/forms";
import { useLocationDetailForm } from "../../hooks/useLocationDetailForm";
import { DetailSection, DetailRow } from "../DetailLayout";
import { ControlledInputRow } from "./ControlledDetailRows";

export function TaxonomySection({
  form,
}: {
  form: ReturnType<typeof useLocationDetailForm>["form"];
}) {
  const locationKey = form.watch("locationKey") || "";
  const district = form.watch("district") || "";
  const [identityUnlocked, setIdentityUnlocked] = useState(false);

  return (
    <DetailSection title="Identity & taxonomy">
      <DetailRow label="Location key" multiline>
        {identityUnlocked ? (
          <div className="space-y-2">
            <TaxonomyLocationEditor
              locationKey={locationKey}
              district={district}
              onLocationKeyChange={(next) =>
                form.setValue("locationKey", next, {
                  shouldDirty: true,
                  shouldValidate: true,
                  shouldTouch: true,
                })
              }
              onDistrictChange={(next) =>
                form.setValue("district", next, {
                  shouldDirty: true,
                  shouldValidate: true,
                  shouldTouch: true,
                })
              }
              locationKeyError={form.formState.errors.locationKey?.message}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => setIdentityUnlocked(false)}
            >
              <Lock className="h-3 w-3" />
              Lock identity
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground/80">{locationKey || <span className="italic text-muted-foreground/60">—</span>}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => setIdentityUnlocked(true)}
            >
              <Unlock className="h-3 w-3" />
              Unlock to edit
            </Button>
          </div>
        )}
      </DetailRow>
      <ControlledInputRow
        label="Country code"
        name="countryCode"
        control={form.control}
        placeholder="PE / CO / BR / AR"
      />
    </DetailSection>
  );
}
