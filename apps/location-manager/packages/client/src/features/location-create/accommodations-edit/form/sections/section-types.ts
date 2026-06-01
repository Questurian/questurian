import type { AiSuggestedField } from "../../../accommodations-create/accommodations-create.types";

export type SuggestProps = (fieldKey: AiSuggestedField) => {
  canSuggest: boolean;
  isSuggesting: boolean;
  onSuggest: () => void;
};
