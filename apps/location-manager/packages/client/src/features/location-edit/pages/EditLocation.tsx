import { Pencil } from "lucide-react";
import { SubmitButton } from "@client/shared/components/ui";
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
    return <div>Loading location...</div>;
  }

  if (fetchError) {
    return (
      <div>
        <p style={{ color: "red" }}>Error loading location: {fetchError.message}</p>
        <button onClick={navigateHome}>Back to locations</button>
      </div>
    );
  }

  if (!location) {
    return (
      <div>
        <p>Location not found</p>
        <button onClick={navigateHome}>Back to locations</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background" data-theme="dark">
      <div className="w-full max-w-[1200px] bg-background rounded-xl p-4 sm:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500" data-theme="light">
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
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
              Error: {updateError.message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
