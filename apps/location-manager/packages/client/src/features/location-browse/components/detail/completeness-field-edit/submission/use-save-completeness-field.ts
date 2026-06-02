import type { LocationResponse, UpdateMapsRequest } from "@client/shared/services/api/types";
import { useUpdateLocation } from "@client/shared/services/api/hooks/useUpdateLocation";
import { useToast } from "@client/shared/hooks/useToast";
import {
  buildNightlifeFieldUpdatePayload,
  isNightlifeFieldKey,
  isNightlifeMultiFieldKey,
} from "@client/shared/lib/nightlife-details";
import {
  buildDetailFieldUpdatePayload,
  getDetailFieldConfig,
} from "../completeness-detail-fields";
import { getCoreFieldConfig } from "../core-completeness-fields";
import type { FieldDef } from "../completeness-field-edit.types";
import type { useCompletenessFieldDraft } from "../drafts/use-completeness-field-draft";
import { getCenterToastPosition } from "../toast-position";
import type { SaveStrategy, SaveStrategyContext } from "./save-strategy";

interface UseSaveCompletenessFieldProps {
  field: FieldDef;
  locationDetail: LocationResponse;
  draft: ReturnType<typeof useCompletenessFieldDraft>;
  onClose: () => void;
}

export function useSaveCompletenessField({
  field,
  locationDetail,
  draft,
  onClose,
}: UseSaveCompletenessFieldProps) {
  const { showToast } = useToast();
  const { mutate: updateLocation, isPending } = useUpdateLocation();

  const save = (data: UpdateMapsRequest, successMessage: string, errorMessage: string) => {
    updateLocation(
      { category: locationDetail.category, id: locationDetail.id, data },
      {
        onSuccess: () => {
          showToast(successMessage, getCenterToastPosition());
          onClose();
        },
        onError: (error) => showToast(error.message || errorMessage, getCenterToastPosition()),
      }
    );
  };

  function showValidationError(message: string) {
    showToast(message, getCenterToastPosition());
  }

  const strategy = getSaveStrategy(field.key);
  const strategyContext: SaveStrategyContext = {
    field,
    locationDetail,
    draft,
    save,
    close: onClose,
    showValidationError,
  };

  const handleSave = () => {
    strategy.save(strategyContext);
  };

  const canSave = strategy.canSave(strategyContext);

  return { handleSave, isPending, canSave };
}

function getSaveStrategy(fieldKey: string): SaveStrategy {
  if (isNightlifeFieldKey(fieldKey)) return nightlifeStrategy;
  if (getDetailFieldConfig(fieldKey)) return detailFieldStrategy;
  return getCoreFieldConfig(fieldKey)?.saveStrategy ?? unsavableStrategy;
}

const unsavableStrategy: SaveStrategy = {
  canSave: () => false,
  save: () => {},
};

const detailFieldStrategy: SaveStrategy = {
  canSave: ({ field, draft }) => {
    const config = getDetailFieldConfig(field.key);
    if (!config) return false;
    return config.kind === "multi"
      ? draft.detailMultiDraft.length > 0
      : draft.value.trim().length > 0;
  },
  save: ({ field, locationDetail, draft, save, showValidationError }) => {
    const config = getDetailFieldConfig(field.key);
    if (!config) return;
    const value = config.kind === "multi" ? draft.detailMultiDraft : draft.value;
    if (Array.isArray(value) ? !value.length : !value.trim()) {
      showValidationError(
        config.kind === "multi"
          ? `Select at least one ${config.label.toLowerCase()} option`
          : `Select a value for ${config.label.toLowerCase()}`
      );
      return;
    }
    save(
      buildDetailFieldUpdatePayload(config, locationDetail, value),
      `${config.label} saved`,
      `Failed to save ${config.label}`
    );
  },
};

const nightlifeStrategy: SaveStrategy = {
  canSave: ({ field, draft }) => {
    if (!isNightlifeFieldKey(field.key)) return false;
    return isNightlifeMultiFieldKey(field.key)
      ? draft.nightlifeMultiDraft.length > 0
      : draft.value.trim().length > 0;
  },
  save: ({ field, locationDetail, draft, save, showValidationError }) => {
    if (!isNightlifeFieldKey(field.key)) return;
    const fieldKey = field.key;
    const value = isNightlifeMultiFieldKey(fieldKey) ? draft.nightlifeMultiDraft : draft.value;
    if (Array.isArray(value) ? !value.length : !value.trim()) {
      showValidationError(
        isNightlifeMultiFieldKey(fieldKey)
          ? `Select at least one ${field.label.toLowerCase()} option`
          : `Select an option for ${field.label.toLowerCase()}`
      );
      return;
    }
    save(
      buildNightlifeFieldUpdatePayload(locationDetail.nightlifeDetails, fieldKey, value),
      `${field.label} saved`,
      `Failed to save ${field.label}`
    );
  },
};
