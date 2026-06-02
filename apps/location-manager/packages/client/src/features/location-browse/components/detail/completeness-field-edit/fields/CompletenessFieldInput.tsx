import { NightlifeMultiOptionTable, NightlifeSingleOptionTable } from "@client/shared/components/forms";
import { isNightlifeFieldKey, isNightlifeMultiFieldKey } from "@client/shared/lib/nightlife-details";
import { toggleNightlifeMusicSelection } from "@client/shared/lib/nightlife-music";
import { Input } from "@client/components/ui";
import type { FieldDef } from "../completeness-field-edit.types";
import { getDetailFieldConfig } from "../completeness-detail-fields";
import { getCoreFieldConfig } from "../core-completeness-fields";
import type { CompletenessFieldDraft } from "../drafts/use-completeness-field-draft";
import { NIGHTLIFE_MULTI_FIELD_OPTIONS, NIGHTLIFE_SINGLE_FIELD_OPTIONS } from "../field-options";

interface CompletenessFieldInputProps {
  field: FieldDef;
  category: string;
  draft: CompletenessFieldDraft;
  isPending: boolean;
}

export function CompletenessFieldInput({
  field,
  category,
  draft,
  isPending,
}: CompletenessFieldInputProps) {
  if (isNightlifeFieldKey(field.key)) {
    if (isNightlifeMultiFieldKey(field.key)) {
      return (
        <NightlifeMultiOptionTable
          label={field.label}
          options={NIGHTLIFE_MULTI_FIELD_OPTIONS[field.key] ?? []}
          values={draft.nightlifeMultiDraft}
          onToggle={(selectedValue) =>
            draft.setNightlifeMultiDraft((prev) =>
              field.key === "nightlife.music"
                ? toggleNightlifeMusicSelection(prev, selectedValue)
                : prev.includes(selectedValue)
                  ? prev.filter((item) => item !== selectedValue)
                  : [...prev, selectedValue]
            )
          }
        />
      );
    }

    return (
      <NightlifeSingleOptionTable
        label={field.label}
        options={NIGHTLIFE_SINGLE_FIELD_OPTIONS[field.key] ?? []}
        value={draft.value}
        onChange={draft.setValue}
        placeholder={`Select ${field.label.toLowerCase()}`}
      />
    );
  }

  const detailConfig = getDetailFieldConfig(field.key);
  if (detailConfig) {
    if (detailConfig.kind === "multi") {
      return (
        <NightlifeMultiOptionTable
          label={detailConfig.label}
          options={detailConfig.options ?? []}
          values={draft.detailMultiDraft}
          onToggle={(selectedValue) =>
            draft.setDetailMultiDraft((prev) =>
              prev.includes(selectedValue)
                ? prev.filter((item) => item !== selectedValue)
                : [...prev, selectedValue]
            )
          }
        />
      );
    }
    if (detailConfig.kind === "text") {
      return (
        <Input
          value={draft.value}
          onChange={(event) => draft.setValue(event.target.value)}
          placeholder={`Enter ${detailConfig.label.toLowerCase()}`}
        />
      );
    }
    return (
      <NightlifeSingleOptionTable
        label={detailConfig.label}
        options={detailConfig.options ?? []}
        value={draft.value}
        onChange={draft.setValue}
        placeholder={`Select ${detailConfig.label.toLowerCase()}`}
      />
    );
  }

  const coreConfig = getCoreFieldConfig(field.key);
  if (coreConfig?.editor) {
    return <>{coreConfig.editor({ field, category, draft, isPending })}</>;
  }

  return (
    <Input
      value={draft.value}
      onChange={(event) => draft.setValue(event.target.value)}
      placeholder={`Enter ${field.label.toLowerCase()}`}
    />
  );
}
