import type { Dispatch, SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AddNightlifeFormData } from "../../validation/add-nightlife.schema";
import type { NightlifeFormSection, NightlifeMultiField } from "../nightlife-create.types";

export interface NightlifeFormProps {
  activeSection: NightlifeFormSection;
  bookingUrlAcked: boolean;
  contactComplete: boolean;
  coreComplete: boolean;
  entitiesComplete: boolean;
  error: Error | null;
  form: UseFormReturn<AddNightlifeFormData>;
  handleGooglePrefill: () => Promise<void>;
  isPending: boolean;
  isPrefillReady: boolean;
  isPrefillingGoogle: boolean;
  onInvalidSubmit: Parameters<UseFormReturn<AddNightlifeFormData>["handleSubmit"]>[1];
  onSubmit: (data: AddNightlifeFormData) => void;
  prefillError: string | null;
  prefillIsStale: boolean;
  prefillMessage: string | null;
  sceneComplete: boolean;
  setBookingUrlAcked: Dispatch<SetStateAction<boolean>>;
  spaceComplete: boolean;
  stepOneComplete: boolean;
  toggleMultiOption: (field: NightlifeMultiField, value: string) => void;
  goToNextSection: () => Promise<void>;
  goToPreviousSection: () => void;
}
