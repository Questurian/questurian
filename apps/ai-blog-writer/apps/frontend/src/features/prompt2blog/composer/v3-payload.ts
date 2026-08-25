import type { Prompt2BlogV3Request } from '../api'
import type { P2BFormState } from './composer.types'

const APPROVAL_BLOCKERS: Record<string, string> = {
  not_started: 'Generate three directions and approve a commission before running.',
  awaiting_selection: 'Choose one of the three directions before running.',
  needs_approval: 'Approve the commission before running.',
}

const RECONFIRMATION_BLOCKERS: Record<string, string> = {
  legacy_draft: 'This saved draft predates the commission flow. Reconfirm it before running.',
  commission_edited: 'The commission changed. Approve it again before running.',
  title_or_location_changed:
    'The title or location changed. Generate directions again before running.',
}

/**
 * Why this commission cannot be submitted to the v3 pipeline yet, in the words
 * the composer shows the user. Returns null when it can be.
 *
 * Research readiness is deliberately absent from this list. The gate is the
 * backend's to run, it costs no writer-model token to reach, and its answer is
 * `needs_research` with a follow-up prompt attached — a result the user needs
 * to see, not a button this side should have disabled.
 */
export function v3SubmissionBlockedReason(state: P2BFormState): string | null {
  if (state.activeWorkflow !== 'editorial_v3') return null

  const { approval, evidencePackage } = state.editorial
  if (approval.status === 'reconfirmation_required') {
    return RECONFIRMATION_BLOCKERS[approval.reason]
  }
  if (approval.status !== 'approved') {
    return APPROVAL_BLOCKERS[approval.status]
  }
  if (!evidencePackage) {
    return 'Import the research package for this commission before running.'
  }
  if (evidencePackage.commission_fingerprint !== approval.commission.commission_fingerprint) {
    return 'The attached research belongs to a different commission.'
  }

  const commissionRequirements = approval.commission.requirements.map(
    requirement => requirement.requirement_id,
  )
  const evidenceRequirements = evidencePackage.requirements.map(
    requirement => requirement.requirement_id,
  )
  const sameRequirements =
    commissionRequirements.length === evidenceRequirements.length &&
    commissionRequirements.every(requirementId => evidenceRequirements.includes(requirementId))
  if (!sameRequirements) {
    return 'The attached research does not answer this commission’s exact requirements.'
  }

  if (!state.toneId || !state.lengthId) return 'Tone and length are required.'

  return null
}

/**
 * Builds the v3 request from an approved commission and its attached research.
 *
 * Nothing here flattens the commission or the evidence into v2 shapes. Both
 * travel whole, which is the point of the migration: the run has to be able to
 * show later what it was commissioned to write and what it was given to write
 * it from.
 */
export function buildPrompt2BlogV3Payload(state: P2BFormState): Prompt2BlogV3Request | null {
  if (v3SubmissionBlockedReason(state) !== null) return null
  if (state.activeWorkflow !== 'editorial_v3') return null

  const { approval, evidencePackage } = state.editorial
  if (approval.status !== 'approved' || !evidencePackage) return null

  return {
    schema_version: 3,
    commission: approval.commission,
    evidence_package: evidencePackage,
    profiles: {
      tone_id: state.toneId,
      length_id: state.lengthId,
      brand_voice_id: state.brandVoiceId || null,
      creativity_level: state.creativityLevel,
    },
    model_routing: {
      model_name: state.modelName,
      writing_model: state.writingModel,
      audit_model: state.auditModel,
      model_stack_id: state.modelStackId,
    },
    include_debug: true,
    // v3 refuses this flag with a 400 rather than accepting it and ignoring
    // it: augmentation rewrites audited prose and has not been re-verified
    // against the evidence model. The composer no longer offers the toggle.
    enable_editorial_augmentation: false,
  }
}
