import { useAddLocationFlow } from "../hooks/useAddLocationFlow";
import { useBatchUploadFlow } from "../hooks/useBatchUploadFlow";
import { useCopyForAI } from "../hooks/useCopyForAI";
import { AddLocationForm } from "../components/AddLocationForm";
import { BatchInputPhase } from "../components/BatchInputPhase";
import { BatchUploadPhase } from "../components/BatchUploadPhase";
import { BatchCompletePhase } from "../components/BatchCompletePhase";
import { ConfirmLocationPhase } from "../components/ConfirmLocationPhase";
import { ReviewsFetchPhase } from "../components/ReviewsFetchPhase";
import { SuccessPhase } from "../components/SuccessPhase";

export function AddLocation() {
  const flow = useAddLocationFlow();
  const batch = useBatchUploadFlow(flow.setPhase);
  const copyForAI = useCopyForAI();

  switch (flow.phase) {
    case "batch-input":
      return (
        <BatchInputPhase
          batch={batch}
          copyForAI={copyForAI}
          onCancel={() => flow.setPhase("add")}
        />
      );

    case "batch-processing":
      return (
        <BatchUploadPhase
          items={batch.items}
          onComplete={batch.handleComplete}
          onCancel={batch.handleCancel}
        />
      );

    case "batch-complete":
      return (
        <BatchCompletePhase
          results={batch.results}
          onAddMore={batch.handleReset}
          onDone={flow.navigateHome}
        />
      );

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

    default:
      return (
        <AddLocationForm
          form={flow.addForm}
          onSubmit={flow.handleAddLocation}
          isCreating={flow.isCreating}
          createError={flow.createError}
          selectedCategory={flow.selectedCategory}
          locationTypes={flow.locationTypes}
          isLoadingTypes={flow.isLoadingTypes}
          onBatchClick={() => flow.setPhase("batch-input")}
        />
      );
  }
}
