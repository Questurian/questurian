import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BedDouble, ChevronLeft } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Breadcrumbs } from "@client/shared/components/layout";
import { ErrorAlert } from "@client/shared/components/ui";
import { useLocationById } from "@client/shared/services/api";
import { useLocationTypes } from "@client/shared/services/api/hooks/useLocationTypes";
import type { LocationCategory } from "@shared/types/location-category";
import {
  addAccommodationsSchema,
  type AddAccommodationsFormData,
} from "../validation/add-accommodations.schema";
import {
  ACCOMMODATIONS_FORM_DEFAULT_VALUES,
  type MultiField,
} from "../accommodations-create/accommodations-create.types";
import { SuggestionStackOverlay } from "../accommodations-create/suggestions/AccommodationsSuggestionOverlays";
import { needsTitleBackfill as computeNeedsTitleBackfill } from "./hydration/accommodations-edit-hydration";
import { useAccommodationsEditHydration } from "./hydration/useAccommodationsEditHydration";
import { useAccommodationsReprefill } from "./enrichment/useAccommodationsReprefill";
import { useAccommodationsEditSuggestions } from "./suggestions/useAccommodationsEditSuggestions";
import { useUpdateAccommodations } from "./submission/useUpdateAccommodations";
import { AccommodationsEditForm } from "./form/AccommodationsEditForm";

function EditShell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1200px] mx-auto">{children}</div>;
}

export function EditAccommodationsLocation() {
  const { id, category } = useParams<{ id: string; category: LocationCategory }>();
  const navigate = useNavigate();
  const locationId = id ? Number.parseInt(id, 10) : null;

  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);

  const { data: location, isLoading, error: fetchError } = useLocationById(locationId, "accommodations");
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes("accommodations");

  const form = useForm<AddAccommodationsFormData>({
    resolver: zodResolver(addAccommodationsSchema),
    defaultValues: ACCOMMODATIONS_FORM_DEFAULT_VALUES,
    mode: "onChange",
  });

  const needsTitleBackfill = useMemo(
    () => (location ? computeNeedsTitleBackfill(location) : false),
    [location]
  );

  useAccommodationsEditHydration({ form, location, setPrefillSignature });

  const reprefill = useAccommodationsReprefill({ form, prefillSignature, setPrefillSignature });
  const suggestions = useAccommodationsEditSuggestions({ form, locationId, locationTypes });
  const submission = useUpdateAccommodations({ locationId });

  const toggleMultiOption = (field: MultiField, value: string) => {
    const currentValues = (form.getValues(field) || []) as string[];
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];

    form.setValue(field, nextValues as AddAccommodationsFormData[MultiField], {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  if (category !== "accommodations") {
    return (
      <EditShell>
        <Breadcrumbs items={[{ label: "Edit Accommodations" }]} />
        <ErrorAlert title="Invalid route" message="This editor is only available for accommodations." />
      </EditShell>
    );
  }

  if (isLoading) {
    return (
      <EditShell>
        <Breadcrumbs items={[{ label: "Edit Accommodations" }]} />
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading accommodations...
        </div>
      </EditShell>
    );
  }

  if (fetchError) {
    return (
      <EditShell>
        <Breadcrumbs items={[{ label: "Edit Accommodations" }]} />
        <ErrorAlert title="Error loading accommodations" message={fetchError.message} />
      </EditShell>
    );
  }

  if (!location) {
    return (
      <EditShell>
        <Breadcrumbs items={[{ label: "Edit Accommodations" }]} />
        <ErrorAlert title="Not found" message="Accommodations location not found." />
      </EditShell>
    );
  }

  return (
    <EditShell>
      <Breadcrumbs items={[{ label: location.title || location.source.name || "Edit Accommodations" }]} />
      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <BedDouble className="w-4 h-4 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground underline">
              Edit Accommodations
            </h1>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>

        <AccommodationsEditForm
          form={form}
          location={location}
          locationId={locationId}
          suggestProps={suggestions.suggestProps}
          onToggleMulti={toggleMultiOption}
          isLoadingTypes={isLoadingTypes}
          locationTypes={locationTypes}
          isPrefillingGoogle={reprefill.isPrefillingGoogle}
          prefillMessage={reprefill.prefillMessage}
          prefillError={reprefill.prefillError}
          prefillIsStale={reprefill.prefillIsStale}
          onGooglePrefill={() => void reprefill.handleGooglePrefill()}
          bookingSuggestState={suggestions.bookingSuggestState}
          onBookingUrlSuggest={() => void suggestions.handleBookingUrlSuggest()}
          isPending={submission.isPending}
          needsTitleBackfill={needsTitleBackfill}
          updateError={submission.error}
          onSubmit={submission.handleSubmit}
          onCancel={() => navigate("/")}
        />
      </div>

      <SuggestionStackOverlay
        stack={suggestions.suggestionStack}
        locationTypes={locationTypes}
        pendingCount={suggestions.pendingFields.size}
        onApply={suggestions.applyStackedSuggestion}
        onDismiss={suggestions.dismissStackedSuggestion}
      />
    </EditShell>
  );
}
