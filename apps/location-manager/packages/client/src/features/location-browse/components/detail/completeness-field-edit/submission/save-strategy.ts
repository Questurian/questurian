import type { LocationResponse, UpdateMapsRequest } from "@client/shared/services/api/types";
import type { FieldDef } from "../completeness-field-edit.types";
import type { CompletenessFieldDraft } from "../drafts/use-completeness-field-draft";

/**
 * Shared save-strategy contract. A strategy decides whether the current draft
 * is saveable (`canSave`) and performs the persist (`save`). It is the single
 * unit referenced by the core field registry, the nightlife registry, and the
 * granular detail-field registry, so every field expresses its save behaviour
 * the same way.
 */
export interface SaveStrategyContext {
  field: FieldDef;
  locationDetail: LocationResponse;
  draft: CompletenessFieldDraft;
  save: (data: UpdateMapsRequest, successMessage: string, errorMessage: string) => void;
  close: () => void;
  showValidationError: (message: string) => void;
}

export interface SaveStrategy {
  canSave: (context: SaveStrategyContext) => boolean;
  save: (context: SaveStrategyContext) => void;
}
