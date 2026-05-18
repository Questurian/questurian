import { useAddLocationFlow } from "../hooks/useAddLocationFlow";
import { useBatchUploadFlow } from "../hooks/useBatchUploadFlow";
import { useCopyForAI } from "../hooks/useCopyForAI";
import { AddLocationForm } from "../components/AddLocationForm";
import { BatchInputPhase } from "../components/BatchInputPhase";
import { BatchUploadPhase } from "../components/BatchUploadPhase";
import { BatchCompletePhase } from "../components/BatchCompletePhase";
import { ConfirmLocationPhase } from "../components/ConfirmLocationPhase";
import { SuccessPhase } from "../components/SuccessPhase";
import type { LocationCategory } from "@shared/types/location-category";

interface AddLocationProps {
  forcedCategory?: LocationCategory;
  heading?: string;
  hideCategoryField?: boolean;
  enableBatch?: boolean;
}

export function AddLocation({
  forcedCategory,
  heading = "Add Location",
  hideCategoryField = false,
  enableBatch = true,
}: AddLocationProps) {
  const flow = useAddLocationFlow(forcedCategory);
  const batch = useBatchUploadFlow(flow.setPhase);
  const copyForAI = useCopyForAI();

  switch (flow.phase) {
    case "batch-input":
      if (!enableBatch) {
        return null;
      }
      return (
        <BatchInputPhase
          batch={batch}
          copyForAI={copyForAI}
          onCancel={() => flow.setPhase("add")}
        />
      );

    case "batch-processing":
      if (!enableBatch) {
        return null;
      }
      return (
        <BatchUploadPhase
          items={batch.items}
          onComplete={batch.handleComplete}
          onCancel={batch.handleCancel}
        />
      );

    case "batch-complete":
      if (!enableBatch) {
        return null;
      }
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
          onBatchClick={enableBatch ? () => flow.setPhase("batch-input") : undefined}
          heading={heading}
          hideCategoryField={hideCategoryField}
        />
      );
  }
}
