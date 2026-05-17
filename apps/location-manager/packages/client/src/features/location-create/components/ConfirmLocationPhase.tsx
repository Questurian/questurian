import type { UseFormReturn } from "react-hook-form";
import { Check } from "lucide-react";
import { FormInput } from "@client/shared/components/forms";
import { SubmitButton } from "@client/shared/components/ui";
import type { ConfirmLocationFormData } from "../validation/add-location.schema";

interface ConfirmLocationPhaseProps {
  createdLocation: {
    name: string;
    title: string;
    phoneNumber?: string;
    website?: string;
  };
  confirmForm: UseFormReturn<ConfirmLocationFormData>;
  onSubmit: (data: ConfirmLocationFormData) => void;
  isUpdating: boolean;
  updateError: Error | null;
}

export function ConfirmLocationPhase({
  createdLocation,
  confirmForm,
  onSubmit,
  isUpdating,
  updateError,
}: ConfirmLocationPhaseProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-xl bg-card border border-border rounded-2xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Confirm Location Details</h1>
        </div>

        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
          <p className="text-sm text-emerald-400">
            Location "{createdLocation.name}" added successfully!
          </p>
        </div>

        <form onSubmit={confirmForm.handleSubmit(onSubmit)} className="space-y-4">
          <FormInput
            name="title"
            label="Display Title"
            control={confirmForm.control}
            placeholder="Clean display title"
            description={`Current: "${createdLocation.title}"`}
          />

          <FormInput
            name="phoneNumber"
            label="Phone Number"
            control={confirmForm.control}
            placeholder="Phone number (optional)"
            description={`Current: ${createdLocation.phoneNumber || "None"}`}
          />

          <FormInput
            name="website"
            label="Website"
            control={confirmForm.control}
            placeholder="https://example.com (optional)"
            description={`Current: ${createdLocation.website || "None"}`}
          />

          <SubmitButton
            isLoading={isUpdating}
            submitText="Confirm Details"
            submittingText="Updating..."
            disabled={!confirmForm.formState.isValid}
            className="w-full h-10 mt-2 text-sm font-normal bg-primary text-primary-foreground hover:bg-primary/90"
          />

          {updateError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Error: {updateError.message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
