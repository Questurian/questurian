import { AddDiningStagedForm } from "../components/AddDiningStagedForm";
import { ConfirmLocationPhase } from "../components/ConfirmLocationPhase";
import { ReviewsFetchPhase } from "../components/ReviewsFetchPhase";
import { Stage2Phase } from "../components/Stage2Phase";
import { DiningPostCreatePhase } from "../components/DiningPostCreatePhase";
import { useAddDiningFlow } from "../hooks/useAddDiningFlow";

export function AddDiningLocation() {
  const flow = useAddDiningFlow();

  switch (flow.phase) {
    case "confirm":
      return (
        <ConfirmLocationPhase
          createdLocation={flow.createdLocation!}
          confirmForm={flow.confirmForm}
          onSubmit={flow.handleConfirmTitle}
          isUpdating={flow.isUpdating}
          updateError={flow.updateError}
        />
      );
    case "reviews":
      return (
        <ReviewsFetchPhase
          category={flow.createdLocation!.category}
          locationId={flow.createdLocation!.id}
          locationName={flow.createdLocation!.title || flow.createdLocation!.name}
          tripadvisorUrl={flow.createdLocation!.tripadvisorUrl || null}
          placeId={flow.createdLocation!.placeId || null}
          onComplete={() => flow.setPhase("stage2")}
          onSkip={() => flow.setPhase("success")}
        />
      );
    case "stage2":
      return (
        <Stage2Phase
          locationId={flow.createdLocation!.id}
          onComplete={() => flow.setPhase("success")}
          onSkip={() => flow.setPhase("success")}
        />
      );
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
          isCreating={flow.isCreating}
          createError={flow.createError}
          prefillMessage={flow.prefillMessage}
          prefillError={flow.prefillError}
          prefillIsStale={flow.prefillIsStale}
          isPrefillReady={flow.isPrefillReady}
          locationTypes={flow.locationTypes}
          isLoadingTypes={flow.isLoadingTypes}
          provenance={flow.provenance}
        />
      );
  }
}
