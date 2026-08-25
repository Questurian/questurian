import type { Prompt2BlogCommission, Prompt2BlogEvidencePackage } from '../api'

export type EvidenceCommissionMatch =
  | 'matches'
  | 'different_commission'
  | 'different_requirements'

/** Whether attached evidence belongs to, and answers, this exact commission. */
export function compareEvidenceToCommission(
  commission: Prompt2BlogCommission,
  evidencePackage: Prompt2BlogEvidencePackage
): EvidenceCommissionMatch {
  if (evidencePackage.commission_fingerprint !== commission.commission_fingerprint) {
    return 'different_commission'
  }

  const commissionRequirements = commission.requirements.map(
    requirement => requirement.requirement_id
  )
  const evidenceRequirements = evidencePackage.requirements.map(
    requirement => requirement.requirement_id
  )
  const sameRequirements =
    commissionRequirements.length === evidenceRequirements.length &&
    commissionRequirements.every(requirementId => evidenceRequirements.includes(requirementId))

  return sameRequirements ? 'matches' : 'different_requirements'
}
