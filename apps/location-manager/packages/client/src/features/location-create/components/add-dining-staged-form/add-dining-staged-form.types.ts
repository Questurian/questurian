import type { UseFormReturn } from "react-hook-form";
import type { FieldProvenance } from "@questurian/lm-shared";
import type { AddDiningFormData } from "../../validation/add-dining.schema";
import type {
  AiFieldStatus,
  AiSuggestionFieldKey,
} from "../../hooks/useAddDiningFlow";
import type { PhotoImportSessionState } from "../PhotoImportPhase";

export type DiningFormSection = "step1" | "review" | "photos";

export interface AddDiningStagedFormProps {
  form: UseFormReturn<AddDiningFormData>;
  onSubmit: (
    data: AddDiningFormData,
    photoSession?: { sessionId: string; cropped: PhotoImportSessionState["cropped"] }
  ) => void;
  onRunGooglePrefill: () => Promise<boolean>;
  isPrefillingGoogle: boolean;
  aiBatchStep: "google" | "tripadvisor" | "ai" | null;
  isCreating: boolean;
  createError: Error | null;
  prefillMessage: string | null;
  prefillError: string | null;
  prefillIsStale: boolean;
  isPrefillReady: boolean;
  locationTypes: { value: string; label: string }[];
  isLoadingTypes: boolean;
  provenance: Partial<
    Record<"type" | "tripadvisorUrl" | "menuUrl" | "bookingUrl", FieldProvenance>
  >;
  verifiedAiUrls: Record<"menuUrl" | "bookingUrl", boolean>;
  onAcknowledgeAiUrl: (field: "menuUrl" | "bookingUrl", verified: boolean) => void;
  allAiUrlsVerified: boolean;
  aiFieldStatus: Record<AiSuggestionFieldKey, AiFieldStatus>;
  onRetryAiField: (fieldKey: AiSuggestionFieldKey) => Promise<void> | void;
}

export interface DiningReviewFieldsProps {
  form: UseFormReturn<AddDiningFormData>;
  provenance: AddDiningStagedFormProps["provenance"];
  verifiedAiUrls: AddDiningStagedFormProps["verifiedAiUrls"];
  onAcknowledgeAiUrl: AddDiningStagedFormProps["onAcknowledgeAiUrl"];
  aiFieldStatus: AddDiningStagedFormProps["aiFieldStatus"];
  onRetryAiField: AddDiningStagedFormProps["onRetryAiField"];
}
