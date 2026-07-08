/**
 * Private internals of TaxonomyCorrectionService — the admin-owned
 * CorrectionRule module. Import via services/taxonomy, not from here.
 */
export type {
  TaxonomyCorrection,
  TaxonomyPartType,
  AffectedPendingTaxonomyEntry,
  AffectedLocationSample,
} from "./types";

export {
  getAllCorrections,
  findCorrection,
  getCorrectionById,
  insertCorrection,
  deleteCorrection,
} from "./rules.repository";

export {
  deduplicatePendingTaxonomy,
  bulkUpdatePendingTaxonomy,
  bulkUpdateLocationKeys,
} from "./retroactive-apply.repository";

export {
  findAffectedPendingTaxonomy,
  countAffectedLocations,
  findAffectedLocationSamples,
} from "./impact.repository";
