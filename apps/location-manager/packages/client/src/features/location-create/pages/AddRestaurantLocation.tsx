import { AddRestaurantStagedForm } from "../components/AddRestaurantStagedForm";
import { ConfirmLocationPhase } from "../components/ConfirmLocationPhase";
import { ReviewsFetchPhase } from "../components/ReviewsFetchPhase";
import { SuccessPhase } from "../components/SuccessPhase";
import { useAddRestaurantFlow } from "../hooks/useAddRestaurantFlow";

export function AddRestaurantLocation() {
  const flow = useAddRestaurantFlow();

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
          onComplete={() => flow.setPhase("success")}
          onSkip={() => flow.setPhase("success")}
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
        <AddRestaurantStagedForm
          form={flow.addForm}
          onSubmit={flow.handleAddRestaurant}
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
