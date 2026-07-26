import { isOptionSuggestionEligible } from "../../autofill/option-suggestion-eligibility";
import type { AddAccommodationsFormData } from "../../validation/add-accommodations.schema";
import {
  ACCOMMODATIONS_FORM_DEFAULT_VALUES,
  type AiSuggestedField,
  type ApiFilledField,
} from "../accommodations-create.types";
import {
  AUTO_AI_SUGGESTION_FIELDS,
  getSuggestionField,
  getSuggestionFieldOptions,
} from "./accommodations-suggestion-utils";
import type { LocationTypeOption } from "./accommodations-suggestion-request";

interface SuggestionEligibilityInput {
  fieldKey: AiSuggestedField;
  value: AddAccommodationsFormData[AiSuggestedField];
  locationTypes: LocationTypeOption[];
  isPrefillReady: boolean;
  isDirty: boolean;
  isApiFilled: boolean;
  isAiSuggested: boolean;
  isPending: boolean;
  isQueued: boolean;
}

export function canSuggestAccommodationsField({
  fieldKey,
  value,
  locationTypes,
  isPrefillReady,
  isDirty,
  isApiFilled,
  isAiSuggested,
  isPending,
  isQueued,
}: SuggestionEligibilityInput) {
  if (isPending || isQueued) return false;
  const definition = getSuggestionField(fieldKey);
  return isOptionSuggestionEligible({
    value,
    defaultValue: ACCOMMODATIONS_FORM_DEFAULT_VALUES[fieldKey],
    isPrefillReady,
    optionsCount: getSuggestionFieldOptions(fieldKey, locationTypes).length,
    isDirty,
    isApiFilled,
    isAiSuggested,
    isUrlKind: definition?.kind === "url",
  });
}

export function getEligibleAutoSuggestionFields({
  formValues,
  apiFilledFields,
  locationTypes,
}: {
  formValues: AddAccommodationsFormData;
  apiFilledFields: Set<ApiFilledField>;
  locationTypes: LocationTypeOption[];
}) {
  return AUTO_AI_SUGGESTION_FIELDS.filter((fieldKey) => {
    const definition = getSuggestionField(fieldKey);
    return (
      Boolean(definition) &&
      !apiFilledFields.has(fieldKey as ApiFilledField) &&
      isOptionSuggestionEligible({
        value: formValues[fieldKey],
        defaultValue: ACCOMMODATIONS_FORM_DEFAULT_VALUES[fieldKey],
        isPrefillReady: true,
        optionsCount: getSuggestionFieldOptions(fieldKey, locationTypes).length,
        isDirty: false,
        isApiFilled: false,
        isAiSuggested: false,
        isUrlKind: definition?.kind === "url",
      })
    );
  });
}
