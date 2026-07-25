/**
 * Public facade for granular completeness fields stored inside category detail
 * JSON. Category descriptors, registry lookup, and immutable update assembly
 * live in focused modules under detail-fields/.
 */
export type {
  DetailDraftValue,
  DetailFieldConfig,
  DetailFieldKind,
  DetailFieldOption,
} from "./detail-fields/detail-field.types";

export {
  getDetailFieldConfig,
  isDetailFieldKey,
  isDetailMultiFieldKey,
} from "./detail-fields/detail-field.registry";

export {
  buildDetailFieldUpdatePayload,
  canSaveDetailFieldValue,
  withAttractionContactDetail,
} from "./detail-fields/detail-field-updates";
