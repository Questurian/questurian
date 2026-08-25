import type {
  Prompt2BlogCommission,
  Prompt2BlogCommissionDraft,
  Prompt2BlogDirectionOption,
  Prompt2BlogDirectionOptionId,
  Prompt2BlogDirectionResponse
} from '../api'
import type { P2BEditorialComposerState, P2BFormState } from './composer.types'
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
    approval: { status: 'not_started' }
  }
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
      approval: { status: 'awaiting_selection' }
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
      approval: { status: 'needs_approval' }
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
      approval: { status: 'approved', commission }
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
      }
    }
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
