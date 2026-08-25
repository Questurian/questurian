import type {
  Prompt2BlogCommission,
  Prompt2BlogCommissionDraft,
  Prompt2BlogDirectionOption,
  Prompt2BlogDirectionOptionId,
  Prompt2BlogEvidencePackage,
  Prompt2BlogModelName,
  Prompt2BlogWriterModel,
} from '../api'
import type { Prompt2BlogModelStackId } from '../constants/prompt2blog.constants'

export type P2BActiveWorkflow = 'legacy_v2' | 'editorial_v3'

export type P2BCommissionApproval =
  | { status: 'not_started' }
  | { status: 'awaiting_selection' }
  | { status: 'needs_approval' }
  | {
      status: 'reconfirmation_required'
      reason: 'legacy_draft' | 'commission_edited' | 'title_or_location_changed'
    }
  | { status: 'approved'; commission: Prompt2BlogCommission }

export interface P2BEditorialComposerState {
  directionOptions: Prompt2BlogDirectionOption[]
  selectedOptionId: Prompt2BlogDirectionOptionId | null
  commissionDraft: Prompt2BlogCommissionDraft | null
  approval: P2BCommissionApproval
  /**
   * Imported research for the currently approved commission. Readiness
   * findings stay derived rather than stored, so they cannot drift from the
   * commission they describe.
   */
  evidencePackage: Prompt2BlogEvidencePackage | null
  /**
   * The commission the operator has confirmed they read, by fingerprint.
   *
   * Choosing a direction card approves a commission outright, so approval on
   * its own says nothing about whether a human looked at what was locked. This
   * records that they did. Storing the fingerprint rather than a flag means a
   * commission that changes cannot inherit the old one's review: the value no
   * longer matches, and the step reopens on its own.
   */
  reviewedCommissionFingerprint: string | null
}

export interface P2BFormState {
  activeWorkflow: P2BActiveWorkflow
  editorial: P2BEditorialComposerState
  easySetupLocation: string
  easySetupTitle: string
  modelStackId: Prompt2BlogModelStackId
  modelName: Prompt2BlogModelName
  writingModel: Prompt2BlogWriterModel
  auditModel: Prompt2BlogWriterModel
  toneId: string
  lengthId: string
  brandVoiceId: string
  creativityLevel: 'low' | 'medium' | 'high'
}
