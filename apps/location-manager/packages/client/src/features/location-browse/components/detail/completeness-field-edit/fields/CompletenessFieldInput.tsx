import type { Dispatch, SetStateAction } from "react";
import { OptionTableFieldEditor, type OptionTableFieldOption } from "@client/shared/components/forms";
import { getNightlifeFieldConfig, isNightlifeFieldKey } from "@client/shared/lib/nightlife-details";
import { toggleNightlifeMusicSelection } from "@client/shared/lib/nightlife-music";
import { Input } from "@client/components/ui";
import type { FieldDef } from "../completeness-field-edit.types";
import { getDetailFieldConfig, type DetailFieldConfig } from "../completeness-detail-fields";
import { defaultFieldEditor, getCoreFieldConfig } from "../core-completeness-fields";
import type { CompletenessFieldDraft } from "../drafts/use-completeness-field-draft";
import { NIGHTLIFE_MULTI_FIELD_OPTIONS, NIGHTLIFE_SINGLE_FIELD_OPTIONS } from "../field-options";

interface CompletenessFieldInputProps {
  field: FieldDef;
  category: string;
  draft: CompletenessFieldDraft;
  isPending: boolean;
}

interface OptionTableEditorConfig {
  label: string;
  kind: "single" | "multi" | "boolean";
  options: OptionTableFieldOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
}

export function CompletenessFieldInput({
  field,
  category,
  draft,
  isPending,
}: CompletenessFieldInputProps) {
  const coreConfig = getCoreFieldConfig(field.key);
  if (coreConfig?.editor) {
    return <>{coreConfig.editor({ field, category, draft, isPending })}</>;
  }

  const optionTableConfig = getOptionTableEditorConfig(field, draft);
  if (optionTableConfig) {
    return <OptionTableFieldEditor {...optionTableConfig} />;
  }

  const detailConfig = getDetailFieldConfig(field.key);
  if (detailConfig?.kind === "text") {
    return (
      <Input
        value={draft.value}
        onChange={(event) => draft.setValue(event.target.value)}
        placeholder={`Enter ${detailConfig.label.toLowerCase()}`}
      />
    );
  }

  return <>{defaultFieldEditor({ field, category, draft, isPending })}</>;
}

function getOptionTableEditorConfig(
  field: FieldDef,
  draft: CompletenessFieldDraft
): OptionTableEditorConfig | null {
  if (isNightlifeFieldKey(field.key)) {
    const config = getNightlifeFieldConfig(field.key);
    if (!config) return null;

    if (config.kind === "multi") {
      return {
        label: field.label,
        kind: config.kind,
        options: NIGHTLIFE_MULTI_FIELD_OPTIONS[field.key] ?? [],
        value: draft.nightlifeMultiDraft,
        onChange: (nextValue) =>
          updateMultiDraft(draft.setNightlifeMultiDraft, nextValue, {
            musicMode: field.key === "nightlife.music",
          }),
      };
    }

    return {
      label: field.label,
      kind: config.kind,
      options: NIGHTLIFE_SINGLE_FIELD_OPTIONS[field.key] ?? [],
      value: draft.value,
      onChange: (nextValue) => draft.setValue(typeof nextValue === "string" ? nextValue : ""),
      placeholder: `Select ${field.label.toLowerCase()}`,
    };
  }

  const detailConfig = getDetailFieldConfig(field.key);
  if (detailConfig && detailConfig.kind !== "text") {
    return toDetailOptionTableConfig(detailConfig, draft);
  }

  return null;
}

function toDetailOptionTableConfig(
  config: DetailFieldConfig,
  draft: CompletenessFieldDraft
): OptionTableEditorConfig {
  if (config.kind === "multi") {
    return {
      label: config.label,
      kind: config.kind,
      options: config.options ?? [],
      value: draft.detailMultiDraft,
      onChange: (nextValue) => updateMultiDraft(draft.setDetailMultiDraft, nextValue),
    };
  }

  return {
    label: config.label,
    kind: config.kind === "boolean" ? "boolean" : "single",
    options: config.options ?? [],
    value: draft.value,
    onChange: (nextValue) => draft.setValue(typeof nextValue === "string" ? nextValue : ""),
    placeholder: `Select ${config.label.toLowerCase()}`,
  };
}

function updateMultiDraft(
  setDraft: Dispatch<SetStateAction<string[]>>,
  nextValue: string | string[],
  options: { musicMode?: boolean } = {}
) {
  const nextValues = Array.isArray(nextValue) ? nextValue : [];
  setDraft((previous) => {
    if (!options.musicMode) return nextValues;

    const changedValue =
      nextValues.find((item) => !previous.includes(item)) ??
      previous.find((item) => !nextValues.includes(item));

    return changedValue ? toggleNightlifeMusicSelection(previous, changedValue) : previous;
  });
}
