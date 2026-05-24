import { AddDiningStagedForm } from "../components/AddDiningStagedForm";
import { DiningPostCreatePhase } from "../components/DiningPostCreatePhase";
import { useAddDiningFlow } from "../hooks/useAddDiningFlow";

export function AddDiningLocation() {
  const flow = useAddDiningFlow();

  switch (flow.phase) {
    case "success":
      return (
        <DiningPostCreatePhase
          locationId={flow.createdLocation!.id}
          onAddAnother={flow.handleReset}
          onDone={flow.navigateHome}
        />
      );
    case "add":
    default:
      return (
        <AddDiningStagedForm
          form={flow.addForm}
          onSubmit={flow.handleAddDining}
          onRunGooglePrefill={flow.handleGooglePrefill}
          isPrefillingGoogle={flow.isPrefillingGoogle}
          aiBatchStep={flow.aiBatchStep}
          isCreating={flow.isCreating}
          createError={flow.createError}
          prefillMessage={flow.prefillMessage}
          prefillError={flow.prefillError}
          prefillIsStale={flow.prefillIsStale}
          isPrefillReady={flow.isPrefillReady}
          locationTypes={flow.locationTypes}
          isLoadingTypes={flow.isLoadingTypes}
          provenance={flow.provenance}
          verifiedAiUrls={flow.verifiedAiUrls}
          onAcknowledgeAiUrl={flow.acknowledgeAiUrl}
          allAiUrlsVerified={flow.allAiUrlsVerified}
          aiFieldStatus={flow.aiFieldStatus}
          onRetryAiField={flow.retryAiField}
        />
      );
  }
}
