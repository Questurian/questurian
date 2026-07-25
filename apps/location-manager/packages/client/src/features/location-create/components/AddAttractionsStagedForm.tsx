import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { CheckCircle2, ChevronLeft, Landmark } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@client/components/ui/button";
import { AttractionsPrimarySections } from "./attractions-form/AttractionsPrimarySections";
import { AttractionsVisitContactSection } from "./attractions-form/AttractionsVisitContactSection";
import { useAttractionsFormFlow } from "./attractions-form/useAttractionsFormFlow";
import type { AddAttractionsFormData } from "../validation/add-attractions.schema";

interface AddAttractionsStagedFormProps {
  form: UseFormReturn<AddAttractionsFormData>;
  onSubmit: (data: AddAttractionsFormData) => void;
  onRunGooglePrefill: () => Promise<boolean>;
  isPrefillingGoogle: boolean;
  isCreating: boolean;
  createError: Error | null;
  prefillMessage: string | null;
  prefillError: string | null;
  prefillIsStale: boolean;
  isPrefillReady: boolean;
  locationTypes: { value: string; label: string }[];
  isLoadingTypes: boolean;
}

export function AddAttractionsStagedForm({
  form,
  onSubmit,
  onRunGooglePrefill,
  isPrefillingGoogle,
  isCreating,
  createError,
  prefillMessage,
  prefillError,
  prefillIsStale,
  isPrefillReady,
  locationTypes,
  isLoadingTypes,
}: AddAttractionsStagedFormProps) {
  const [operationHoursModalOpen, setOperationHoursModalOpen] = useState(false);
  const [bookingUrlAcked, setBookingUrlAcked] = useState(true);
  const {
    activeSection,
    isAdvancing,
    flowSections,
    canOpenSection,
    goToSection,
    goToPreviousSection,
    goToNextSection,
    handleContinue,
  } = useAttractionsFormFlow({
    form,
    isPrefillReady,
    onRunGooglePrefill,
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-6xl rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Landmark className="w-4 h-4 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground underline">
                  Add Attractions
                </h1>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="h-9 border-border/80 bg-background/60 px-3 text-foreground hover:bg-accent/70"
              >
                <Link to="/add">
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {flowSections.map((section, index) => {
                const isActive = activeSection === section.key;
                const isDisabled = !canOpenSection(section.key);
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => goToSection(section.key)}
                    disabled={isDisabled}
                    className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-border bg-muted text-foreground"
                        : isDisabled
                          ? "cursor-not-allowed border-border/50 bg-background text-muted-foreground/55"
                          : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <span>{index + 1}.</span>
                    <span>{section.label}</span>
                    {section.complete && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <AttractionsPrimarySections
              activeSection={activeSection}
              form={form}
              isPrefillReady={isPrefillReady}
              isPrefillingGoogle={isPrefillingGoogle}
              isAdvancing={isAdvancing}
              isCreating={isCreating}
              prefillMessage={prefillMessage}
              prefillError={prefillError}
              prefillIsStale={prefillIsStale}
              locationTypes={locationTypes}
              isLoadingTypes={isLoadingTypes}
              onContinue={handleContinue}
              onPrevious={goToPreviousSection}
              onNext={goToNextSection}
            />
            <AttractionsVisitContactSection
              activeSection={activeSection}
              form={form}
              isPrefillReady={isPrefillReady}
              isCreating={isCreating}
              operationHoursModalOpen={operationHoursModalOpen}
              setOperationHoursModalOpen={setOperationHoursModalOpen}
              bookingUrlAcked={bookingUrlAcked}
              setBookingUrlAcked={setBookingUrlAcked}
              onPrevious={goToPreviousSection}
            />

            {createError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Error: {createError.message}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
