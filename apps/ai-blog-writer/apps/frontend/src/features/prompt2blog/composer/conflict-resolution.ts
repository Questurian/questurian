import type { Prompt2BlogEvidencePackage } from '../types/editorial.types'

/**
 * The operator settling a disagreement the research desk reported.
 *
 * A conflict is not missing evidence. Both sides are already found, already
 * sourced and already in the package — what is missing is a decision about
 * which one the article follows. The desk cannot make that decision for us,
 * and until now the only route to it was a complete replacement research
 * package: a full deep-research round, twenty-five minutes and a rebuilt
 * evidence JSON, to write one sentence about which of two booking windows
 * Maido's own site means.
 *
 * So this is the conflict twin of the writer's answer. It stores nothing new
 * and cites nothing new; it fills in the `resolution` the schema already
 * carries, and goes through the same validation a pasted package does.
 */
export function resolveConflict(
  evidencePackage: Prompt2BlogEvidencePackage,
  conflictId: string,
  resolution: string
): Prompt2BlogEvidencePackage {
  const text = resolution.trim()
  if (!text) {
    throw new Error('A resolution cannot be empty.')
  }
  const conflicts = evidencePackage.conflicts ?? []
  if (!conflicts.some((conflict) => conflict.conflict_id === conflictId)) {
    throw new Error(`No conflict ${conflictId} in this research.`)
  }
  return {
    ...evidencePackage,
    conflicts: conflicts.map((conflict) =>
      conflict.conflict_id === conflictId
        ? { ...conflict, resolution: text }
        : conflict
    )
  }
}

/** Puts a settled conflict back in dispute, leaving both claims untouched. */
export function clearConflictResolution(
  evidencePackage: Prompt2BlogEvidencePackage,
  conflictId: string
): Prompt2BlogEvidencePackage {
  const conflicts = evidencePackage.conflicts ?? []
  return {
    ...evidencePackage,
    conflicts: conflicts.map((conflict) =>
      conflict.conflict_id === conflictId
        ? { ...conflict, resolution: null }
        : conflict
    )
  }
}

/** Conflicts still holding the run, with the claim texts under dispute. */
export function unresolvedConflicts(
  evidencePackage: Prompt2BlogEvidencePackage
): Array<{ conflictId: string; summary: string; claims: string[] }> {
  const claimText = new Map(
    (evidencePackage.claims ?? []).map((claim) => [claim.claim_id, claim.text])
  )
  return (evidencePackage.conflicts ?? [])
    .filter((conflict) => !conflict.resolution?.trim())
    .map((conflict) => ({
      conflictId: conflict.conflict_id,
      summary: conflict.summary,
      claims: conflict.claim_ids.map(
        (claimId) => claimText.get(claimId) ?? claimId
      )
    }))
}
