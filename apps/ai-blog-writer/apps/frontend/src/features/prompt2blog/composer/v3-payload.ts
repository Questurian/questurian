import type { Prompt2BlogV3Request } from '../api'
import type { P2BFormState } from './composer.types'
import { compareEvidenceToCommission } from './evidence-match'
import { P2B_NEXT_ACTION } from './step-guidance'

const APPROVAL_BLOCKERS: Record<string, string> = {
  not_started: P2B_NEXT_ACTION.direction,
  awaiting_selection: P2B_NEXT_ACTION.chooseDirection,
  needs_approval: P2B_NEXT_ACTION.changedCommission,
}

const RECONFIRMATION_BLOCKERS: Record<string, string> = {
  legacy_draft: P2B_NEXT_ACTION.savedCommission,
  commission_edited: P2B_NEXT_ACTION.editedCommission,
  title_or_location_changed: P2B_NEXT_ACTION.changedIdentity,
}

/** What must happen before the page can build a v3 run. */
export function prompt2BlogSubmissionBlockedReason(state: P2BFormState): string | null {
  if (state.activeWorkflow !== 'editorial_v3') return P2B_NEXT_ACTION.start
  return v3SubmissionBlockedReason(state)
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
  if (
    state.editorial.reviewedCommissionFingerprint !== approval.commission.commission_fingerprint
  ) {
    return P2B_NEXT_ACTION.commission
  }
  if (!evidencePackage) {
    return P2B_NEXT_ACTION.research
  }
  const evidenceMatch = compareEvidenceToCommission(approval.commission, evidencePackage)
  if (evidenceMatch === 'different_commission') {
    return P2B_NEXT_ACTION.mismatchedResearch
  }
  if (evidenceMatch === 'different_requirements') {
    return P2B_NEXT_ACTION.incompleteResearch
  }

  if (!state.toneId || !state.lengthId) return P2B_NEXT_ACTION.chooseProfiles

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
