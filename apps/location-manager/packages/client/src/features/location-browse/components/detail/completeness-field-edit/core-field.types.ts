import type { ReactNode } from "react";
import type { LocationResponse } from "@client/shared/services/api/types";
import type { FieldDef } from "./completeness-field-edit.types";
import type { CompletenessFieldDraft } from "./drafts/use-completeness-field-draft";
import type { SaveStrategy } from "./submission/save-strategy";

export interface CoreFieldEditorContext {
  field: FieldDef;
  category: string;
  draft: CompletenessFieldDraft;
  isPending: boolean;
}

export interface CoreFieldConfig {
  /** Seeds the shared `value` draft slice when the editor opens. */
  draftInit?: (location: LocationResponse) => string;
  /** Renders the field editor. Omitted for fields rendered by the modal shell
   *  itself (e.g. `media`, `contactUrl`). */
  editor?: (context: CoreFieldEditorContext) => ReactNode;
  /** Whether the draft is saveable and how it persists. */
  saveStrategy: SaveStrategy;
}
