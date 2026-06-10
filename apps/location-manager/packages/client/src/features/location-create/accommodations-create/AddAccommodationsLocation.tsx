import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { BedDouble, CheckCircle2, ChevronLeft } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { useLocationTypes } from "@client/shared/services/api/hooks/useLocationTypes";
import { useGooglePhotoImportEnabled } from "@client/shared/services/api/hooks";
import type { GooglePrefillResponse } from "@client/shared/services/api/types";
import type { PhotoImportSessionState } from "../components/PhotoImportPhase";
import {
  addAccommodationsSchema,
  buildAccommodationsPrefillSignature,
  type AddAccommodationsFormData,
} from "../validation/add-accommodations.schema";
import {
  ACCOMMODATIONS_FORM_DEFAULT_VALUES,
  ACCOMMODATIONS_SECTION_ORDER,
  type AccommodationsFormSection,
  type ApiFilledField,
} from "./accommodations-create.types";
import { AccommodationsFormSections } from "./form/AccommodationsForm";
import { clearAccommodationsDraftFromStorage } from "./draft/accommodations-draft-storage";
import { useAccommodationsDraft } from "./draft/useAccommodationsDraft";
import { useAccommodationsPrefill } from "./enrichment/useAccommodationsPrefill";
import { getAccommodationsFormProgress } from "./form/accommodations-form-progress";
import { useCreateAccommodations } from "./submission/useCreateAccommodations";
import {
  AutoFillProgressOverlay,
  SuggestionStackOverlay,
} from "./suggestions/AccommodationsSuggestionOverlays";
import { useAccommodationsSuggestions } from "./suggestions/useAccommodationsSuggestions";

export function AddAccommodationsLocation() {
  const [activeSection, setActiveSection] = useState<AccommodationsFormSection>("step1");
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [apiFilledFields, setApiFilledFields] = useState<Set<ApiFilledField>>(() => new Set());
  const [googlePrefillContext, setGooglePrefillContext] = useState<GooglePrefillResponse | null>(null);
  const [verifiedAiUrls, setVerifiedAiUrls] = useState({ bookingUrl: true });
  const [createdName, setCreatedName] = useState<string | null>(null);
  const [photoSession, setPhotoSession] = useState<PhotoImportSessionState | null>(null);
  const form = useForm<AddAccommodationsFormData>({
    resolver: zodResolver(addAccommodationsSchema),
    defaultValues: ACCOMMODATIONS_FORM_DEFAULT_VALUES,
    mode: "onChange",
  });
  const { data: locationTypes = [], isLoading: isLoadingTypes } = useLocationTypes("accommodations");
  const currentPrefillSignature = buildAccommodationsPrefillSignature(form.watch("name"), form.watch("address"));
  const isPrefillReady = prefillSignature !== null && prefillSignature === currentPrefillSignature;
  const suggestions = useAccommodationsSuggestions({
    form,
    isPrefillReady,
    locationTypes,
    apiFilledFields,
    googlePrefillContext,
    setVerifiedAiUrls,
  });
  const resetFlow = () => {
    setPhotoSession(null);
    form.reset(ACCOMMODATIONS_FORM_DEFAULT_VALUES);
    setPrefillSignature(null);
    setPrefillMessage(null);
    setPrefillError(null);
    setApiFilledFields(new Set());
    setGooglePrefillContext(null);
    suggestions.resetSuggestions();
    setActiveSection("step1");
    clearAccommodationsDraftFromStorage();
  };
  const submission = useCreateAccommodations({
    prefillSignature,
    photoSession,
    onValidationError: setPrefillError,
    onSuccess: (name) => {
      setCreatedName(name);
      resetFlow();
    },
  });
  const prefill = useAccommodationsPrefill({
    form,
    isPending: submission.isPending,
    prefillSignature,
    setPrefillSignature,
    setActiveSection,
    setApiFilledFields,
    setGooglePrefillContext,
    setPrefillMessage,
    setPrefillError,
    resetSuggestions: suggestions.resetSuggestions,
    runAutoAiFill: suggestions.runAutoAiFill,
    setAutoFillProgress: suggestions.setAutoFillProgress,
  });
  useAccommodationsDraft({ form, prefillSignature, setPrefillSignature, setPrefillMessage, setPrefillError });

  const photoReady = photoSession?.ready ?? false;
  const photoCount = photoSession?.cropped.length ?? 0;
  const selectedCount = photoSession?.selected.length ?? 0;
  const progress = getAccommodationsFormProgress(
    form.watch(),
    isPrefillReady,
    photoReady,
    selectedCount,
    form.formState.isValid,
    suggestions.aiSuggestedFields.has("bookingUrl") &&
      Boolean(form.watch("bookingUrl")) &&
      !verifiedAiUrls.bookingUrl
  );
  const { enabled: photoImportEnabled } = useGooglePhotoImportEnabled();
  const sectionOrder = photoImportEnabled
    ? ACCOMMODATIONS_SECTION_ORDER
    : ACCOMMODATIONS_SECTION_ORDER.filter((section) => section !== "photos");
  const visibleSections = progress.flowSections.filter(
    (section) => photoImportEnabled || section.key !== "photos"
  );
  const canOpenSection = (section: AccommodationsFormSection) =>
    (section === "step1" || isPrefillReady) && (section !== "photos" || photoImportEnabled);
  const goToSection = (section: AccommodationsFormSection) => {
    if (canOpenSection(section)) setActiveSection(section);
  };
  const moveSection = (offset: number) => {
    const section = sectionOrder[sectionOrder.indexOf(activeSection) + offset];
    if (section) goToSection(section);
  };
  const handleClearExceptStep1 = () => {
    const name = form.getValues("name");
    const address = form.getValues("address");
    resetFlow();
    form.reset({ ...ACCOMMODATIONS_FORM_DEFAULT_VALUES, name, address });
  };

  useEffect(() => {
    if (!isPrefillReady && activeSection !== "step1") setActiveSection("step1");
  }, [activeSection, isPrefillReady]);

  useEffect(() => {
    if (!photoImportEnabled && activeSection === "photos") setActiveSection("details");
  }, [activeSection, photoImportEnabled]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-6xl rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <BedDouble className="w-4 h-4 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground underline">Add Accommodations</h1>
              </div>
              <Button type="button" variant="outline" size="sm" asChild className="h-9 border-border/80 bg-background/60 px-3 text-foreground hover:bg-accent/70">
                <Link to="/add"><ChevronLeft className="h-4 w-4" />Back</Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {visibleSections.map((section, index) => {
                const isActive = activeSection === section.key;
                const isDisabled = !canOpenSection(section.key);
                return (
                  <button key={section.key} type="button" onClick={() => goToSection(section.key)} disabled={isDisabled}
                    className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${isActive ? "border-border bg-muted text-foreground" : isDisabled ? "cursor-not-allowed border-border/50 bg-background text-muted-foreground/55" : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"}`}>
                    <span>{index + 1}.</span><span>{section.label}</span>
                    {section.complete && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </div>
          {createdName && <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">Created accommodations document: {createdName}</div>}
          <AccommodationsFormSections {...{
            activeSection, ...suggestions, ...progress, ...submission, ...prefill, aiSuggestedFields: suggestions.aiSuggestedFields,
            error: submission.error, form, goToNextSection: () => moveSection(1), goToPreviousSection: () => moveSection(-1),
            handleClearExceptStep1, isLoadingTypes, locationTypes, photoCount, photoReady, prefillError,
            prefillMessage, selectedCount, setPhotoSession, setVerifiedAiUrls, verifiedAiUrls,
          }} />
          <SuggestionStackOverlay stack={suggestions.suggestionStack} locationTypes={locationTypes} pendingCount={suggestions.pendingFields.size} onApply={suggestions.applyStackedSuggestion} onDismiss={suggestions.dismissStackedSuggestion} />
          <AutoFillProgressOverlay progress={suggestions.autoFillProgress} />
        </div>
      </div>
    </div>
  );
}
