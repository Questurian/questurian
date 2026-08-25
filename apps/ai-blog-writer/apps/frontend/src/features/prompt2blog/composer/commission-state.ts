import type {
  Prompt2BlogCommission,
  Prompt2BlogCommissionDraft,
  Prompt2BlogDirectionOption,
  Prompt2BlogDirectionOptionId,
  Prompt2BlogDirectionResponse,
  Prompt2BlogEvidencePackage
} from '../api'
import type {
  P2BCommissionApproval,
  P2BEditorialComposerState,
  P2BFormState
} from './composer.types'
import {
  commissionMatchesDraft,
  createCommissionDraft,
  fingerprintCommissionSync
} from './commission'

function emptyEditorialState(): P2BEditorialComposerState {
  return {
    directionOptions: [],
    selectedOptionId: null,
    commissionDraft: null,
    approval: { status: 'not_started' },
    evidencePackage: null
  }
}

/**
 * Evidence survives only while the exact commission it was researched against
 * is still approved. Every transition runs through this, so an edit, a new
 * direction import, or a re-approval with a new fingerprint drops research
 * instead of silently carrying it forward.
 */
export function retainedEvidencePackage(
  evidencePackage: Prompt2BlogEvidencePackage | null,
  approval: P2BCommissionApproval
): Prompt2BlogEvidencePackage | null {
  if (!evidencePackage || approval.status !== 'approved') return null
  return evidencePackage.commission_fingerprint ===
    approval.commission.commission_fingerprint
    ? evidencePackage
    : null
}

function cloneOption(
  option: Prompt2BlogDirectionOption
): Prompt2BlogDirectionOption {
  return {
    ...option,
    topic_module_ids: [...option.topic_module_ids],
    audience: {
      ...option.audience,
      tags: option.audience.tags ? [...option.audience.tags] : []
    },
    scope: {
      ...option.scope,
      references: option.scope.references.map((reference) => ({ ...reference }))
    },
    requirements: option.requirements.map((requirement) => ({
      ...requirement
    })),
    exclusions: [...option.exclusions]
  }
}

/** Enters v3 direction work without retaining a stale selection or approval. */
export function startEditorialWorkflow(state: P2BFormState): P2BFormState {
  return {
    ...state,
    activeWorkflow: 'editorial_v3',
    editorial: emptyEditorialState()
  }
}

/** Stores a response only after the strict direction importer has validated it. */
export function applyValidatedDirectionResponse(
  state: P2BFormState,
  response: Prompt2BlogDirectionResponse
): P2BFormState {
  return {
    ...state,
    activeWorkflow: 'editorial_v3',
    editorial: {
      directionOptions: response.options.map(cloneOption),
      selectedOptionId: null,
      commissionDraft: null,
      approval: { status: 'awaiting_selection' },
      evidencePackage: null
    }
  }
}

/**
 * Converts one human-selected option into an editable commission. Title and
 * location come from app state, never the model response that carried options.
 */
export function selectDirectionOption(
  state: P2BFormState,
  optionId: Prompt2BlogDirectionOptionId
): P2BFormState {
  const option = state.editorial.directionOptions.find(
    (item) => item.option_id === optionId
  )
  if (!option)
    throw new Error(`Direction option "${optionId}" is not available.`)

  const commissionDraft = createCommissionDraft(
    state.easySetupTitle.trim(),
    state.easySetupLocation.trim(),
    option
  )

  return {
    ...state,
    activeWorkflow: 'editorial_v3',
    editorial: {
      ...state.editorial,
      selectedOptionId: optionId,
      commissionDraft,
      approval: { status: 'needs_approval' },
      evidencePackage: null
    }
  }
}

/** Records a fully fingerprinted snapshot without computing its fingerprint. */
export function approveCommission(
  state: P2BFormState,
  commission: Prompt2BlogCommission
): P2BFormState {
  if (!state.editorial.commissionDraft) {
    throw new Error('A commission draft must be selected before approval.')
  }
  if (
    commission.original_title !== state.easySetupTitle.trim() ||
    commission.location !== state.easySetupLocation.trim()
  ) {
    throw new Error(
      'Approved commission must keep the app-owned title and location.'
    )
  }
  if (!commissionMatchesDraft(state.editorial.commissionDraft, commission)) {
    throw new Error(
      'Approved commission must match the current commission draft.'
    )
  }
  if (
    fingerprintCommissionSync(commission) !== commission.commission_fingerprint
  ) {
    throw new Error(
      'Approved commission fingerprint does not match its contents.'
    )
  }

  return {
    ...state,
    activeWorkflow: 'editorial_v3',
    editorial: {
      ...state.editorial,
      approval: { status: 'approved', commission },
      evidencePackage: retainedEvidencePackage(state.editorial.evidencePackage, {
        status: 'approved',
        commission
      })
    }
  }
}

/** Any commission-owned edit retracts approval; profile/model fields stay untouched. */
export function editCommissionDraft(
  state: P2BFormState,
  patch: Partial<Prompt2BlogCommissionDraft>
): P2BFormState {
  if (!state.editorial.commissionDraft) return state

  return {
    ...state,
    editorial: {
      ...state.editorial,
      commissionDraft: {
        ...state.editorial.commissionDraft,
        ...patch,
        // Identity remains app-owned even if a broad editor patch contains it.
        original_title: state.easySetupTitle.trim(),
        location: state.easySetupLocation.trim()
      },
      approval: {
        status: 'reconfirmation_required',
        reason: 'commission_edited'
      },
      evidencePackage: null
    }
  }
}

/**
 * Attaches imported research to the approved commission. The caller must have
 * validated the package first; this only refuses evidence that cannot belong
 * to what is approved right now.
 */
export function storeEvidencePackage(
  state: P2BFormState,
  evidencePackage: Prompt2BlogEvidencePackage
): P2BFormState {
  const retained = retainedEvidencePackage(
    evidencePackage,
    state.editorial.approval
  )
  if (!retained) {
    throw new Error(
      'Evidence can only be stored against the currently approved commission.'
    )
  }
  return {
    ...state,
    activeWorkflow: 'editorial_v3',
    editorial: { ...state.editorial, evidencePackage: retained }
  }
}

/** Drops imported research without disturbing the approved commission. */
export function clearEvidencePackage(state: P2BFormState): P2BFormState {
  if (!state.editorial.evidencePackage) return state
  return {
    ...state,
    editorial: { ...state.editorial, evidencePackage: null }
  }
}

/** Leaves all legacy fields and run preferences intact while abandoning v3 work. */
export function clearDirectionWorkflow(state: P2BFormState): P2BFormState {
  return {
    ...state,
    activeWorkflow: 'legacy_v2',
    editorial: emptyEditorialState()
  }
}
