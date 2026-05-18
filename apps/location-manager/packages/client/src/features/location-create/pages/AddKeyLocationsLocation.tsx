import { AddKeyLocationsStagedForm } from "../components/AddKeyLocationsStagedForm";
import { ConfirmLocationPhase } from "../components/ConfirmLocationPhase";
import { SuccessPhase } from "../components/SuccessPhase";
import { useAddKeyLocationsFlow } from "../hooks/useAddKeyLocationsFlow";

export function AddKeyLocationsLocation() {
  const flow = useAddKeyLocationsFlow();

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
    case "success":
      return (
        <SuccessPhase
          locationTitle={flow.createdLocation!.title}
          onAddAnother={flow.handleReset}
          onDone={flow.navigateHome}
        />
      );
    case "add":
    default:
      return (
        <AddKeyLocationsStagedForm
          form={flow.addForm}
          onSubmit={flow.handleAddKeyLocations}
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
        />
      );
  }
}
