import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams } from "react-router-dom";
import { Music2 } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Breadcrumbs } from "@client/shared/components/layout";
import { ErrorAlert } from "@client/shared/components/ui";
import { useLocationById } from "@client/shared/services/api";
import { toggleNightlifeMusicSelection } from "@client/shared/lib/nightlife-music";
import type { LocationCategory } from "@shared/types/location-category";
import {
  editNightlifeSchema,
  NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES,
  type EditNightlifeFormData,
  type NightlifeEditMultiField,
} from "../nightlife-edit/nightlife-edit.types";
import { useNightlifeEditHydration } from "../nightlife-edit/hydration/useNightlifeEditHydration";
import { useNightlifeReprefill } from "../nightlife-edit/enrichment/useNightlifeReprefill";
import { useNightlifeEditSuggestions } from "../nightlife-edit/suggestions/useNightlifeEditSuggestions";
import { useUpdateNightlife } from "../nightlife-edit/submission/useUpdateNightlife";
import { NightlifeEditForm } from "../nightlife-edit/form/NightlifeEditForm";

function EditShell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1200px] mx-auto">{children}</div>;
}

export function EditNightlifeLocation() {
  const navigate = useNavigate();
  const { id, category } = useParams<{ id: string; category: LocationCategory }>();

  const parsedId = id ? Number.parseInt(id, 10) : Number.NaN;
  const locationId = Number.isFinite(parsedId) ? parsedId : null;
  const routeCategory = category === "nightlife" ? "nightlife" : null;

  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);

  const form = useForm<EditNightlifeFormData>({
    resolver: zodResolver(editNightlifeSchema),
    defaultValues: NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES,
    mode: "onChange",
  });

  const { data: location, isLoading, error: fetchError } = useLocationById(locationId, routeCategory);
  const reprefill = useNightlifeReprefill({ form, prefillSignature, setPrefillSignature });
  const suggestions = useNightlifeEditSuggestions(locationId);
  const clearPrefillFeedback = useCallback(
    () => reprefill.clearPrefillFeedback(),
    [reprefill.clearPrefillFeedback]
  );

  useNightlifeEditHydration({
    form,
    location,
    setPrefillSignature,
    clearPrefillFeedback,
  });

  const submission = useUpdateNightlife({
    form,
    locationId,
    onHydrated: () => undefined,
    onSuccessMessage: reprefill.setPrefillMessage,
    onErrorMessage: reprefill.setPrefillError,
    setPrefillSignature,
  });

  const toggleMultiOption = (field: NightlifeEditMultiField, value: string) => {
    const currentValues = (form.getValues(field) || []) as string[];
    const nextValues =
      field === "music"
        ? toggleNightlifeMusicSelection(currentValues, value)
        : currentValues.includes(value)
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value];

    form.setValue(field, nextValues as EditNightlifeFormData[NightlifeEditMultiField], {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  if (routeCategory !== "nightlife" || locationId === null) {
    return (
      <EditShell>
        <Breadcrumbs items={[{ label: "Edit Nightlife" }]} />
        <ErrorAlert
          title="Invalid edit route"
          message="Nightlife edit requires /edit/nightlife/:id"
          onRetry={() => navigate("/")}
        />
      </EditShell>
    );
  }

  if (isLoading) {
    return (
      <EditShell>
        <Breadcrumbs items={[{ label: "Edit Nightlife" }]} />
        <div className="bg-card border border-border rounded-xl p-6 text-sm text-muted-foreground">
          Loading nightlife location...
        </div>
      </EditShell>
    );
  }

  if (fetchError || !location) {
    return (
      <EditShell>
        <Breadcrumbs items={[{ label: "Edit Nightlife" }]} />
        <ErrorAlert
          title="Error loading location"
          message={fetchError?.message || "Nightlife location not found"}
          onRetry={() => navigate("/")}
        />
      </EditShell>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-6xl bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Music2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground underline">Edit Nightlife</h1>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate("/")}>
            Back
          </Button>
        </div>

        {submission.updatedName && (
          <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            Updated nightlife document: {submission.updatedName}
          </div>
        )}

        <NightlifeEditForm
          form={form}
          location={location}
          locationId={locationId}
          onToggleMulti={toggleMultiOption}
          isPrefillingGoogle={reprefill.isPrefillingGoogle}
          prefillMessage={reprefill.prefillMessage}
          prefillError={reprefill.prefillError}
          prefillIsStale={reprefill.prefillIsStale}
          onGooglePrefill={() => void reprefill.handleGooglePrefill()}
          bookingSuggestState={suggestions.bookingSuggestState}
          onBookingUrlSuggest={() => void suggestions.handleBookingUrlSuggest()}
          isPending={submission.isPending}
          updateError={submission.error}
          onSubmit={submission.handleSubmit}
        />
      </div>
    </div>
  );
}
