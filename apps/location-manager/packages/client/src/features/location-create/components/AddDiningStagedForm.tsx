import { useGooglePhotoImportEnabled } from "@client/shared/services/api/hooks";
import { DiningBasicsSection } from "./add-dining-staged-form/DiningBasicsSection";
import { DiningCreateButton } from "./add-dining-staged-form/DiningCreateButton";
import { DiningFormHeader } from "./add-dining-staged-form/DiningFormHeader";
import { DiningPhotosSection } from "./add-dining-staged-form/DiningPhotosSection";
import { DiningReviewSection } from "./add-dining-staged-form/DiningReviewSection";
import type { AddDiningStagedFormProps } from "./add-dining-staged-form/add-dining-staged-form.types";
import { useDiningFormSections } from "./add-dining-staged-form/use-dining-form-sections";

export function AddDiningStagedForm({
  form,
  onSubmit,
  onRunGooglePrefill,
  isPrefillingGoogle,
  aiBatchStep,
  isCreating,
  createError,
  prefillMessage,
  prefillError,
  prefillIsStale,
  isPrefillReady,
  locationTypes,
  isLoadingTypes,
  provenance,
  verifiedAiUrls,
  onAcknowledgeAiUrl,
  allAiUrlsVerified,
  aiFieldStatus,
  onRetryAiField,
}: AddDiningStagedFormProps) {
  const { enabled: photoImportEnabled } = useGooglePhotoImportEnabled();
  const flow = useDiningFormSections({
    form,
    photoImportEnabled,
    isPrefillReady,
    onRunGooglePrefill,
  });
  const placeId = form.watch("placeId");

  const createButton = (
    <DiningCreateButton
      isPrefillReady={isPrefillReady}
      isFormValid={form.formState.isValid}
      isCreating={isCreating}
      photoImportEnabled={photoImportEnabled}
      selectedCount={flow.selectedCount}
      photoCount={flow.photoCount}
      photoReady={flow.photoReady}
      allAiUrlsVerified={allAiUrlsVerified}
    />
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-3xl rounded-2xl border border-border/80 bg-card p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
        <DiningFormHeader
          activeSection={flow.activeSection}
          sections={flow.sections}
          canOpenSection={flow.canOpenSection}
          onOpenSection={flow.goToSection}
        />

        <form
          onSubmit={form.handleSubmit((data) =>
            onSubmit(
              data,
              flow.photoSession && flow.photoSession.cropped.length > 0
                ? {
                    sessionId: flow.photoSession.sessionId,
                    cropped: flow.photoSession.cropped,
                  }
                : undefined
            )
          )}
          className="space-y-5"
        >
          {flow.activeSection === "step1" && (
            <DiningBasicsSection
              form={form}
              isPrefillRunning={isPrefillingGoogle || flow.isAdvancing}
              aiBatchStep={aiBatchStep}
              isCreating={isCreating}
              prefillMessage={prefillMessage}
              prefillError={prefillError}
              prefillIsStale={prefillIsStale}
              onContinue={flow.continueFromBasics}
            />
          )}

          {isPrefillReady && flow.activeSection === "review" && (
            <DiningReviewSection
              form={form}
              provenance={provenance}
              verifiedAiUrls={verifiedAiUrls}
              onAcknowledgeAiUrl={onAcknowledgeAiUrl}
              aiFieldStatus={aiFieldStatus}
              onRetryAiField={onRetryAiField}
              locationTypes={locationTypes}
              isLoadingTypes={isLoadingTypes}
              photoImportEnabled={photoImportEnabled}
              createButton={createButton}
              onPrevious={flow.goToPreviousSection}
              onNext={flow.goToNextSection}
            />
          )}

          {isPrefillReady && photoImportEnabled && flow.activeSection === "photos" && (
            <DiningPhotosSection
              placeId={placeId || null}
              createButton={createButton}
              onSessionChange={flow.setPhotoSession}
              onPrevious={flow.goToPreviousSection}
            />
          )}

          {createError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Error: {createError.message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
