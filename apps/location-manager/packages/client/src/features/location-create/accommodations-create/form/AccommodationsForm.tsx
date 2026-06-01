import type { Dispatch, SetStateAction } from "react";
import type { SubmitHandler, UseFormReturn } from "react-hook-form";
import type { PhotoImportSessionState } from "../../components/PhotoImportPhase";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import type {
  AccommodationsFormSection,
  AiSuggestedField,
  AiSuggestionEvidence,
  MultiField,
} from "../accommodations-create.types";
import { AccommodationsCompletionSteps } from "./sections/AccommodationsCompletionSteps";
import { AccommodationsLookupSteps } from "./sections/AccommodationsLookupSteps";
import { AccommodationsStaySteps } from "./sections/AccommodationsStaySteps";

type SingleOptionField = Exclude<AiSuggestedField, MultiField>;

export interface AccommodationsFormSectionsProps {
  activeSection: AccommodationsFormSection;
  aiSuggestedFields: Set<AiSuggestedField>;
  aiSuggestionEvidence: AiSuggestionEvidence;
  canRunGooglePrefill: boolean;
  coreComplete: boolean;
  createDisabledReason: string | null;
  detailsComplete: boolean;
  entitiesComplete: boolean;
  error: Error | null;
  experienceComplete: boolean;
  form: UseFormReturn<AddAccommodationsFormData>;
  getCanSuggestField: (field: AiSuggestedField) => boolean;
  goToNextSection: () => void;
  goToPreviousSection: () => void;
  handleClearExceptStep1: () => void;
  handleGooglePrefill: () => Promise<void>;
  isAiSuggested: (field: AiSuggestedField) => boolean;
  isApiFilled: (field: string) => boolean;
  isCreatingWithPhotos: boolean;
  isLoadingTypes: boolean;
  isManuallySelected: (field: AiSuggestedField) => boolean;
  isPending: boolean;
  isPrefillReady: boolean;
  isPrefillingGoogle: boolean;
  isSectionPending: (fields: AiSuggestedField[]) => boolean;
  locationTypes: Array<{ value: string; label: string }>;
  onSubmit: SubmitHandler<AddAccommodationsFormData>;
  pendingFields: Set<AiSuggestedField>;
  photoCount: number;
  photoReady: boolean;
  photoSubmitError: Error | null;
  prefillError: string | null;
  prefillIsStale: boolean;
  prefillMessage: string | null;
  queueSuggestion: (field: AiSuggestedField) => Promise<void>;
  selectedCount: number;
  setAiSuggestedFields: Dispatch<SetStateAction<Set<AiSuggestedField>>>;
  setPhotoSession: Dispatch<SetStateAction<PhotoImportSessionState | null>>;
  setSingleOptionField: <TField extends SingleOptionField>(
    field: TField,
    value: AddAccommodationsFormData[TField]
  ) => void;
  setVerifiedAiUrls: Dispatch<SetStateAction<{ bookingUrl: boolean }>>;
  stayComplete: boolean;
  stepOneComplete: boolean;
  suggestAllFields: (fields: AiSuggestedField[]) => void;
  toggleMultiOption: (field: MultiField, value: string) => void;
  verifiedAiUrls: { bookingUrl: boolean };
}

export function AccommodationsFormSections(props: AccommodationsFormSectionsProps) {
  const { form, onSubmit } = props;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <AccommodationsLookupSteps {...props} />
      <AccommodationsStaySteps {...props} />
      <AccommodationsCompletionSteps {...props} />
    </form>
  );
}
