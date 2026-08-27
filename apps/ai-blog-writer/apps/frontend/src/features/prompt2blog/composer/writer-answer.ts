import type {
  Prompt2BlogEvidenceClaim,
  Prompt2BlogEvidencePackage,
  Prompt2BlogEvidenceSource
} from '../types/editorial.types'

/**
 * The operator answering a question the research desk could not.
 *
 * Some facts are real and unpublished at the same time. Nobody publishes how
 * long customs takes at Lima, and a person who walked through it last month
 * knows. Before this the pipeline had nowhere to put that: research came back
 * empty, the question stayed open, and the only evidence route in was another
 * round of searching for a number that does not exist.
 *
 * The answer is not a special case or an override. It becomes first-hand
 * material — the same category the pipeline already accepts for personal
 * essays, interviews and documented evaluations — so it is validated, stored
 * and cited like every other fact.
 *
 * Source and claim ids stay in the schema's own `s1` / `c1` sequence, because
 * evidence validation refuses anything else. What marks an answer as the
 * writer's is the source title, which is free text.
 */
const WRITER_SOURCE_TITLE = 'What the writer knows'

function isWriterAnswerSource(source: Prompt2BlogEvidenceSource): boolean {
  return source.title.startsWith(`${WRITER_SOURCE_TITLE}:`)
}

function nextStableId(existing: readonly string[], prefix: 's' | 'c'): string {
  const highest = existing.reduce((carry, id) => {
    const match = new RegExp(`^${prefix}([1-9]\\d*)$`).exec(id)
    return match ? Math.max(carry, Number(match[1])) : carry
  }, 0)
  return `${prefix}${highest + 1}`
}

/** The source and claim holding the writer's answer to one question, if any. */
function writerAnswerFor(
  evidencePackage: Prompt2BlogEvidencePackage,
  requirementId: string
): { sourceId: string; claimId: string } | null {
  const writerSourceIds = new Set(
    (evidencePackage.sources ?? [])
      .filter(isWriterAnswerSource)
      .map((source) => source.source_id)
  )
  const claim = (evidencePackage.claims ?? []).find(
    (item) =>
      item.requirement_ids.includes(requirementId) &&
      item.source_ids.some((sourceId) => writerSourceIds.has(sourceId))
  )
  if (!claim) return null
  const sourceId = claim.source_ids.find((id) => writerSourceIds.has(id))
  return sourceId ? { sourceId, claimId: claim.claim_id } : null
}

/** Requirement ids the operator has answered from their own knowledge. */
export function writerAnsweredRequirementIds(
  evidencePackage: Prompt2BlogEvidencePackage
): string[] {
  const writerSources = new Set(
    (evidencePackage.sources ?? [])
      .filter(isWriterAnswerSource)
      .map((source) => source.source_id)
  )
  if (writerSources.size === 0) return []
  return [
    ...new Set(
      (evidencePackage.claims ?? [])
        .filter((claim) =>
          claim.source_ids.some((sourceId) => writerSources.has(sourceId))
        )
        .flatMap((claim) => claim.requirement_ids)
    )
  ]
}

/** The answer already recorded for one question, for editing or review. */
export function writerAnswerText(
  evidencePackage: Prompt2BlogEvidencePackage,
  requirementId: string
): string | null {
  const recorded = writerAnswerFor(evidencePackage, requirementId)
  if (!recorded) return null
  const claim = (evidencePackage.claims ?? []).find(
    (item) => item.claim_id === recorded.claimId
  )
  return claim ? claim.text : null
}

/**
 * Records the operator's answer against one question.
 *
 * Answering twice replaces the first answer rather than stacking a second
 * source on the same question: the operator is correcting themselves, not
 * corroborating themselves.
 */
export function recordWriterAnswer(
  evidencePackage: Prompt2BlogEvidencePackage,
  requirementId: string,
  question: string,
  answer: string,
  today: string
): Prompt2BlogEvidencePackage {
  const text = answer.trim()
  if (!text) {
    throw new Error('An answer cannot be empty.')
  }
  if (
    !evidencePackage.requirements.some(
      (requirement) => requirement.requirement_id === requirementId
    )
  ) {
    throw new Error(`No question ${requirementId} in this research.`)
  }

  const cleared = removeWriterAnswer(evidencePackage, requirementId)
  const sourceId = nextStableId(
    (cleared.sources ?? []).map((source) => source.source_id),
    's'
  )
  const claimId = nextStableId(
    (cleared.claims ?? []).map((claim) => claim.claim_id),
    'c'
  )

  const source: Prompt2BlogEvidenceSource = {
    source_id: sourceId,
    title: `${WRITER_SOURCE_TITLE}: ${question}`,
    // Publisher, URL and a publication date are null for operator material by
    // contract. The date the writer told us is what `retrieved_at` records.
    publisher: null,
    url: null,
    published_at: null,
    retrieved_at: today,
    source_type: 'firsthand',
    material_type: 'first-person-notes',
    notes: [text]
  }
  const claim: Prompt2BlogEvidenceClaim = {
    claim_id: claimId,
    text,
    source_ids: [sourceId],
    requirement_ids: [requirementId],
    as_of: today,
    confidence: 'high'
  }

  return {
    ...cleared,
    sources: [...(cleared.sources ?? []), source],
    claims: [...(cleared.claims ?? []), claim],
    requirements: cleared.requirements.map((requirement) =>
      requirement.requirement_id === requirementId
        ? {
            requirement_id: requirementId,
            status: 'supported' as const,
            claim_ids: [...(requirement.claim_ids ?? []), claimId],
            gap: ''
          }
        : requirement
    ),
    // A gap the writer just closed is no longer outstanding research, and
    // leaving it would drag the question back into the next follow-up prompt.
    gaps: (cleared.gaps ?? [])
      .map((gap) => ({
        ...gap,
        requirement_ids: gap.requirement_ids.filter(
          (id) => id !== requirementId
        )
      }))
      .filter((gap) => gap.requirement_ids.length > 0)
  }
}

/**
 * Takes the answer back out and restores the question to unanswered.
 *
 * What research originally reported about this question is gone by then — the
 * package it lived in was replaced. `missing` is the honest state to return
 * to: the operator can research it again or answer it again.
 */
export function removeWriterAnswer(
  evidencePackage: Prompt2BlogEvidencePackage,
  requirementId: string
): Prompt2BlogEvidencePackage {
  const recorded = writerAnswerFor(evidencePackage, requirementId)
  if (!recorded) return evidencePackage
  const { sourceId, claimId } = recorded

  return {
    ...evidencePackage,
    sources: (evidencePackage.sources ?? []).filter(
      (source) => source.source_id !== sourceId
    ),
    claims: (evidencePackage.claims ?? []).filter(
      (claim) => claim.claim_id !== claimId
    ),
    requirements: evidencePackage.requirements.map((requirement) => {
      if (requirement.requirement_id !== requirementId) return requirement
      const claimIds = (requirement.claim_ids ?? []).filter(
        (id) => id !== claimId
      )
      return claimIds.length > 0
        ? {
            requirement_id: requirementId,
            status: 'partial' as const,
            claim_ids: claimIds,
            gap: 'The writer took their own answer back out.'
          }
        : {
            requirement_id: requirementId,
            status: 'missing' as const,
            claim_ids: [],
            gap: 'The writer took their own answer back out.'
          }
    })
  }
}
