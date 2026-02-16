import { Pencil } from "lucide-react";
import { SubmitButton, ErrorAlert } from "@client/shared/components/ui";
import { Breadcrumbs } from "@client/shared/components/layout";
import { Skeleton } from "@client/shared/components/ui";
import { useEditLocationForm } from "../hooks/useEditLocationForm";
import { CoreFieldsSection } from "../components/CoreFieldsSection";
import { TaxonomyFieldsSection } from "../components/TaxonomyFieldsSection";
import { ContactFieldsSection } from "../components/ContactFieldsSection";
import { DetailsFieldsSection } from "../components/DetailsFieldsSection";
import { ExternalFieldsSection } from "../components/ExternalFieldsSection";

export function EditLocation() {
  const {
    form,
    location,
    isLoading,
    fetchError,
    isPending,
    updateError,
    isLoadingTypes,
    locationTypes,
    operationHoursModalOpen,
    setOperationHoursModalOpen,
    handleSubmit,
    navigateHome,
  } = useEditLocationForm();

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumbs items={[{ label: "Edit Location" }]} />
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumbs items={[{ label: "Edit Location" }]} />
        <ErrorAlert
          title="Error loading location"
          message={fetchError.message}
          onRetry={navigateHome}
        />
      </div>
    );
  }

  if (!location) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumbs items={[{ label: "Edit Location" }]} />
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <p className="text-muted-foreground">Location not found</p>
          <button onClick={navigateHome} className="mt-4 text-sm text-primary hover:underline">Back to locations</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <Breadcrumbs items={[{ label: location.title || "Edit Location" }]} />
      <div className="bg-card border border-border rounded-xl p-4 sm:p-6 animate-fade-in-up">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </div>
          <h1 className="text-[24px]! opacity-70 font-medium text-foreground">
            Edit Location
          </h1>
        </div>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <CoreFieldsSection form={form} locationTypes={locationTypes} isLoadingTypes={isLoadingTypes} />
          <TaxonomyFieldsSection form={form} />
          <ContactFieldsSection form={form} />
          <DetailsFieldsSection
            form={form}
            operationHoursModalOpen={operationHoursModalOpen}
            setOperationHoursModalOpen={setOperationHoursModalOpen}
          />
          <ExternalFieldsSection form={form} />

          <div className="space-y-2 mt-6">
            <SubmitButton
              isLoading={isPending}
              submitText="Update Location"
              submittingText="Updating Location..."
              disabled={!form.formState.isDirty}
              className="w-full h-10 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
            />
            <button
              type="button"
              onClick={navigateHome}
              className="w-full h-10 text-sm font-normal bg-secondary text-secondary-foreground hover:bg-secondary/90 border border-border rounded-md"
            >
              Cancel
            </button>
          </div>

          {updateError && (
            <ErrorAlert message={updateError.message} />
          )}
        </form>
      </div>
    </div>
  );
}
