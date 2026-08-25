import type {
  Prompt2BlogCommission,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogEvidencePackage
} from '../api'
import {
  evidenceSatisfiesSourceRequirement,
  type EvidenceReadinessFinding
} from './evidence-import'
import {
  formatEvidencePackageContract,
  REQUIREMENT_STATUS_RULES
} from './research-prompt'

function formatActiveModules(
  commission: Prompt2BlogCommission,
  catalog: Prompt2BlogEditorialOptionsResponse
): string {
  const modules = (commission.topic_module_ids ?? []).map((moduleId) => {
    const module = catalog.topic_modules.find(
      (option) => option.id === moduleId
    )
    if (!module)
      throw new Error(`Unknown commission topic module "${moduleId}".`)
    return `- ${module.id} (${module.label}) — ${module.description.replace(/\s+/g, ' ').trim()}`
  })
  return modules.length ? modules.join('\n') : '- None.'
}

/**
 * Builds a replacement-package prompt only when deterministic readiness data
 * identifies unresolved research. Returns null for a ready package.
 */
export function buildFollowUpResearchPrompt(
  commission: Prompt2BlogCommission,
  evidencePackage: Prompt2BlogEvidencePackage,
  findings: readonly EvidenceReadinessFinding[],
  catalog: Prompt2BlogEditorialOptionsResponse
): string | null {
  if (
    evidencePackage.commission_fingerprint !== commission.commission_fingerprint
  ) {
    throw new Error('Evidence package belongs to a different commission.')
  }

  const form = catalog.forms.find((option) => option.id === commission.form_id)
  if (!form) throw new Error(`Unknown commission form "${commission.form_id}".`)

  const unresolvedRequirementIds = new Set(
    evidencePackage.requirements
      .filter((requirement) => requirement.status !== 'supported')
      .map((requirement) => requirement.requirement_id)
  )
  for (const gap of evidencePackage.gaps ?? []) {
    gap.requirement_ids.forEach((requirementId) =>
      unresolvedRequirementIds.add(requirementId)
    )
  }
  for (const finding of findings) {
    finding.requirement_ids.forEach((requirementId) =>
      unresolvedRequirementIds.add(requirementId)
    )
  }

  const unresolvedRequirements = commission.requirements.filter((requirement) =>
    unresolvedRequirementIds.has(requirement.requirement_id)
  )
  const unresolvedConflicts = (evidencePackage.conflicts ?? []).filter(
    (conflict) => !conflict.resolution?.trim()
  )
  const missingSourceGates = form.source_requirements.filter(
    (requirement) =>
      !evidenceSatisfiesSourceRequirement(
        requirement,
        evidencePackage.sources ?? []
      )
  )

  if (
    unresolvedRequirements.length === 0 &&
    unresolvedConflicts.length === 0 &&
    missingSourceGates.length === 0 &&
    findings.length === 0
  ) {
    return null
  }

  const requirementLines = unresolvedRequirements.length
    ? unresolvedRequirements
        .map(
          (requirement) =>
            `- ${requirement.requirement_id} — ${requirement.question}`
        )
        .join('\n')
    : '- None beyond source-gate or conflict work below.'
  const conflictLines = unresolvedConflicts.length
    ? unresolvedConflicts
        .map((conflict) => `- ${conflict.conflict_id} — ${conflict.summary}`)
        .join('\n')
    : '- None.'
  const findingLines = findings.length
    ? findings
        .map((finding) => {
          const linked = finding.requirement_ids.length
            ? ` [requirements: ${finding.requirement_ids.join(', ')}]`
            : ''
          return `- ${finding.code} — ${finding.message}${linked}`
        })
        .join('\n')
    : '- None.'
  const sourceGateLines = form.source_requirements.length
    ? form.source_requirements
        .map(
          (requirement) =>
            `- ${requirement}${missingSourceGates.includes(requirement) ? ' — unresolved' : ' — already satisfied; preserve supporting evidence'}`
        )
        .join('\n')
    : '- None.'

  return `You are completing unresolved research for an approved travel commission. Return a complete replacement evidence package, not a patch.

AUTHORITY LOCK
The locked commission remains read-only authority.
- Keep commission_fingerprint exactly as supplied.
- Do not change the form, primary subject, scope, reference roles, requirements, exclusions, audience, title, location, or approved direction.
- Do not add a comparator, promote a context-only reference, or broaden scope.
- Research only the unresolved work listed below. Do not write the article.

LOCKED COMMISSION
${JSON.stringify(commission, null, 2)}

CURRENT EVIDENCE PACKAGE
${JSON.stringify(evidencePackage, null, 2)}

UNRESOLVED REQUIREMENTS ONLY
${requirementLines}

UNRESOLVED CONFLICTS ONLY
${conflictLines}

READINESS FINDINGS
${findingLines}

ACTIVE FORM SOURCE GATES
${sourceGateLines}
Meet unresolved gates with genuine matching material. Never simulate interviews, first-person experience, documented evaluation, scenes, or quotations.

ACTIVE TOPIC MODULE METADATA
${formatActiveModules(commission, catalog)}

REPLACEMENT RULES
- Do not redo or weaken already supported work. Preserve valid existing sources, claims, requirement links, dates, metadata, and resolved conflicts.
- Add or revise only what is needed to close the listed requirements, conflicts, findings, and source gates.
- Set requirement status and claim confidence by the rules below, including for work this follow-up still cannot close.
- Keep every locked requirement exactly once in requirements, including already supported requirements.
- Keep source/claim mappings bidirectional and resolvable. Web and report sources require publisher and URL.
- Preserve exact material_type so source-gate readiness remains deterministic.

${REQUIREMENT_STATUS_RULES}

OUTPUT
Return one bare JSON object and nothing else. No Markdown fence, preamble, commentary, or trailing note. Use exactly the shown keys and empty arrays rather than omitted collections. Return the entire replacement package with the locked fingerprint; return no commission object or editorial-authority fields.

${formatEvidencePackageContract(commission.commission_fingerprint)}`
}
