import type { ReactNode } from "react";
import { Button } from "@client/components/ui/button";
import { DiningClassificationFields } from "./DiningClassificationFields";
import { DiningLinkFields } from "./DiningLinkFields";
import { DiningPlaceIdentityFields } from "./DiningPlaceIdentityFields";
import { DiningPublicDetailsFields } from "./DiningPublicDetailsFields";
import type { DiningReviewFieldsProps } from "./add-dining-staged-form.types";

interface DiningReviewSectionProps extends DiningReviewFieldsProps {
  locationTypes: { value: string; label: string }[];
  isLoadingTypes: boolean;
  photoImportEnabled: boolean;
  createButton: ReactNode;
  onPrevious: () => void;
  onNext: () => Promise<void>;
}

export function DiningReviewSection({
  form,
  provenance,
  verifiedAiUrls,
  onAcknowledgeAiUrl,
  aiFieldStatus,
  onRetryAiField,
  locationTypes,
  isLoadingTypes,
  photoImportEnabled,
  createButton,
  onPrevious,
  onNext,
}: DiningReviewSectionProps) {
  const sharedProps: DiningReviewFieldsProps = {
    form,
    provenance,
    verifiedAiUrls,
    onAcknowledgeAiUrl,
    aiFieldStatus,
    onRetryAiField,
  };

  return (
    <section className="space-y-6">
      <DiningPublicDetailsFields form={form} />
      <DiningClassificationFields
        form={form}
        provenance={provenance}
        aiFieldStatus={aiFieldStatus}
        onRetryAiField={onRetryAiField}
        locationTypes={locationTypes}
        isLoadingTypes={isLoadingTypes}
      />
      <DiningLinkFields {...sharedProps} />
      <DiningPlaceIdentityFields form={form} />

      <div className="flex justify-between border-t border-border/70 pt-4">
        <Button type="button" variant="outline" onClick={onPrevious}>
          Previous
        </Button>
        {photoImportEnabled ? (
          <Button type="button" onClick={() => void onNext()}>
            Next
          </Button>
        ) : (
          createButton
        )}
      </div>
    </section>
  );
}
