import { useEffect, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Music2 } from 'lucide-react';
import { Button } from '@client/components/ui/button';
import { toggleNightlifeMusicSelection } from '@client/shared/lib/nightlife-music';
import { addNightlifeSchema, type AddNightlifeFormData } from '../validation/add-nightlife.schema';
import {
  NIGHTLIFE_FORM_DEFAULT_VALUES,
  NIGHTLIFE_SECTION_ORDER,
  buildNightlifePrefillSignature,
  type NightlifeFormSection,
  type NightlifeMultiField,
} from "./nightlife-create.types";
import { clearNightlifeDraftFromStorage } from "./draft/nightlife-draft-storage";
import { useNightlifeDraft } from "./draft/useNightlifeDraft";
import { useNightlifePrefill } from "./enrichment/useNightlifePrefill";
import { NightlifeFormSections } from "./form/NightlifeForm";
import { findFirstNightlifeErrorSection, getNightlifeFormProgress, getNightlifeSectionFields } from "./form/nightlife-form-progress";
import { useCreateNightlife } from "./submission/useCreateNightlife";

export function AddNightlifeLocation() {
  const [activeSection, setActiveSection] = useState<NightlifeFormSection>('step1');
  const [bookingUrlAcked, setBookingUrlAcked] = useState(true);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillSignature, setPrefillSignature] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);

  const form = useForm<AddNightlifeFormData>({
    resolver: zodResolver(addNightlifeSchema),
    defaultValues: NIGHTLIFE_FORM_DEFAULT_VALUES,
    mode: 'onChange',
  });

  const currentPrefillSignature = buildNightlifePrefillSignature(
    form.watch('name'),
    form.watch('location')
  );
  const isPrefillReady = prefillSignature !== null && prefillSignature === currentPrefillSignature;
  const prefillIsStale = prefillSignature !== null && !isPrefillReady;
  const progress = getNightlifeFormProgress(form.watch(), form.formState.errors, isPrefillReady);
  const [stepOneComplete, entitiesComplete, coreComplete, spaceComplete, sceneComplete, contactComplete] =
    progress.flowSections.map((section) => section.complete);
  const flowSections = progress.flowSections;

  const canOpenSection = (section: NightlifeFormSection) => {
    if (section === 'step1') return true;
    return isPrefillReady;
  };

  const goToSection = (section: NightlifeFormSection) => {
    if (!canOpenSection(section)) return;
    setActiveSection(section);
  };

  const goToNextSection = async () => {
    const currentIndex = NIGHTLIFE_SECTION_ORDER.indexOf(activeSection);
    const nextSection = NIGHTLIFE_SECTION_ORDER[currentIndex + 1];
    if (!nextSection) return;

    const currentSectionFields = getNightlifeSectionFields(activeSection);
    if (currentSectionFields.length > 0) {
      const isValid = await form.trigger(currentSectionFields, { shouldFocus: true });
      if (!isValid) {
        return;
      }
    }

    goToSection(nextSection);
  };

  const goToPreviousSection = () => {
    const currentIndex = NIGHTLIFE_SECTION_ORDER.indexOf(activeSection);
    const previousSection = NIGHTLIFE_SECTION_ORDER[currentIndex - 1];
    if (previousSection) {
      goToSection(previousSection);
    }
  };

  useEffect(() => {
    if (!isPrefillReady && activeSection !== 'step1') {
      setActiveSection('step1');
    }
  }, [isPrefillReady, activeSection]);

  const toggleMultiOption = (field: NightlifeMultiField, value: string) => {
    const currentValues = (form.getValues(field) || []) as string[];
    const nextValues =
      field === 'music'
        ? toggleNightlifeMusicSelection(currentValues, value)
        : currentValues.includes(value)
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value];

    form.setValue(field, nextValues as AddNightlifeFormData[NightlifeMultiField], {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const resetFlow = () => {
    form.reset(NIGHTLIFE_FORM_DEFAULT_VALUES);
    setPrefillSignature(null);
    setPrefillMessage(null);
    setPrefillError(null);
    setActiveSection('step1');
    clearNightlifeDraftFromStorage();
  };
  const submission = useCreateNightlife({
    isPrefillReady,
    onValidationError: setPrefillError,
    onSuccess: (name) => {
      setCreatedName(name);
      resetFlow();
    },
  });
  const { error, isPending, onSubmit } = submission;
  const { handleGooglePrefill, isPrefillingGoogle } = useNightlifePrefill({
    form,
    isPending,
    setActiveSection,
    setPrefillSignature,
    setPrefillMessage,
    setPrefillError,
  });
  useNightlifeDraft({ form, prefillSignature, setPrefillSignature, setPrefillMessage, setPrefillError });

  const onInvalidSubmit = (errors: FieldErrors<AddNightlifeFormData>) => {
    const firstErrorSection = findFirstNightlifeErrorSection(errors);
    if (firstErrorSection && firstErrorSection !== activeSection) {
      setActiveSection(firstErrorSection);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-6xl rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Music2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground underline">
                  Add Nightlife
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
                        ? 'border-border bg-muted text-foreground'
                        : isDisabled
                          ? 'cursor-not-allowed border-border/50 bg-background text-muted-foreground/55'
                          : 'border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    <span>{index + 1}.</span>
                    <span>{section.label}</span>
                    {section.complete && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          {createdName && (
            <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              Created nightlife document: {createdName}
              <p className="mt-1 text-xs text-emerald-300">
                Add media from Home after opening this document.
              </p>
            </div>
          )}

          <NightlifeFormSections {...{ activeSection, bookingUrlAcked, contactComplete, coreComplete, entitiesComplete, error, form, goToNextSection, goToPreviousSection, handleGooglePrefill, isPending, isPrefillReady, isPrefillingGoogle, onInvalidSubmit, onSubmit, prefillError, prefillIsStale, prefillMessage, sceneComplete, setBookingUrlAcked, spaceComplete, stepOneComplete, toggleMultiOption }} />
        </div>
      </div>
    </div>
  );
}
