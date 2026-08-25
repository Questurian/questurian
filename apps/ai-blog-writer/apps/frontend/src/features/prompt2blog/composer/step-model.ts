import type { P2BFormState } from './composer.types'

export const P2B_STEP_IDS = [
  'start',
  'direction',
  'commission',
  'research',
  'write'
] as const

export type P2BStepId = (typeof P2B_STEP_IDS)[number]

/** Where the operator stands relative to one step. */
export type P2BStepState = 'done' | 'current' | 'upcoming'

export interface P2BStep {
  id: P2BStepId
  /** 1-based position, shown to the operator. */
  number: number
  /** What this step is called in words a non-technical operator reads. */
  name: string
  /** Why the step exists, in one sentence. */
  purpose: string
  state: P2BStepState
  /** A finished step's one-line recap, or null while it is not finished. */
  summary: string | null
}

interface StepDefinition {
  id: P2BStepId
  name: string
  purpose: string
}

/**
 * The five steps, named for someone who has never seen the pipeline.
 *
 * "Commission" survives here on purpose rather than being softened into
 * "assignment": it is the word the finished article's record uses and the word
 * every document about this pipeline uses, so the page teaches it once instead
 * of maintaining a second vocabulary.
 */
const STEP_DEFINITIONS: readonly StepDefinition[] = [
  {
    id: 'start',
    name: 'Start the article',
    purpose: 'Name what you are writing and where it is about.'
  },
  {
    id: 'direction',
    name: 'Pick a direction',
    purpose:
      'Your chatbot proposes three ways to write it. You choose the one worth commissioning.'
  },
  {
    id: 'commission',
    name: 'Review what you locked',
    purpose:
      'Choosing a direction locked the commission. Check it now, because research can add facts to it but can never change it.'
  },
  {
    id: 'research',
    name: 'Gather the facts',
    purpose:
      'A second chatbot round trip brings back sourced evidence answering the commission’s questions.'
  },
  {
    id: 'write',
    name: 'Write it',
    purpose: 'Set the tone and length, then run the pipeline.'
  }
]

function directionWasChosen(state: P2BFormState): boolean {
  const { status } = state.editorial.approval
  return (
    status === 'approved' ||
    status === 'needs_approval' ||
    status === 'reconfirmation_required'
  )
}

function researchIsAttached(state: P2BFormState): boolean {
  const { approval, evidencePackage } = state.editorial
  if (approval.status !== 'approved' || !evidencePackage) return false
  // Research imported against a different commission is not this commission's
  // research, however complete it looks.
  return (
    evidencePackage.commission_fingerprint ===
    approval.commission.commission_fingerprint
  )
}

function commissionWasReviewed(state: P2BFormState): boolean {
  const { approval, reviewedCommissionFingerprint } = state.editorial
  if (approval.status !== 'approved') return false
  return (
    reviewedCommissionFingerprint === approval.commission.commission_fingerprint
  )
}

function summarizeCommission(state: P2BFormState): string | null {
  const { approval } = state.editorial
  if (approval.status !== 'approved') return null
  return approval.commission.primary_subject || null
}

/**
 * The chosen direction in the operator's words rather than `direction-1`.
 *
 * Only an approved commission carries the direction statement, so a draft that
 * is still awaiting re-approval falls back to no recap rather than to an ID
 * that means nothing to the person reading it.
 */
function summarizeDirection(state: P2BFormState): string | null {
  const { approval } = state.editorial
  if (approval.status !== 'approved') return null
  return approval.commission.approved_direction || null
}

function summarizeResearch(state: P2BFormState): string | null {
  const evidence = state.editorial.evidencePackage
  if (!evidence) return null
  const sources = evidence.sources?.length ?? 0
  const claims = evidence.claims?.length ?? 0
  return `${sources} ${sources === 1 ? 'source' : 'sources'}, ${claims} ${
    claims === 1 ? 'claim' : 'claims'
  }`
}

/**
 * Which of the five steps are finished, and where the operator stands.
 *
 * Derived entirely from composer state the page already keeps, so the
 * indicator cannot drift out of step with the work it describes — a rail that
 * disagrees with the page is worse than no rail at all.
 *
 * Step 3 needs more than an approved commission. Choosing a direction card
 * approves one outright, so approval alone says only that a click happened,
 * not that a human read what got locked. It is finished when the operator has
 * confirmed this exact commission by fingerprint.
 *
 * Step 5 is never `done` here. Finishing it means a completed run, which lives
 * in the pipeline's own state, not the composer's.
 */
export function deriveP2BSteps(state: P2BFormState): P2BStep[] {
  const startedDirectionWork = state.activeWorkflow === 'editorial_v3'
  const titleAndLocation =
    state.easySetupTitle.trim() !== '' && state.easySetupLocation.trim() !== ''

  const completion: Record<P2BStepId, boolean> = {
    start: startedDirectionWork && titleAndLocation,
    direction: startedDirectionWork && directionWasChosen(state),
    commission: commissionWasReviewed(state),
    research: researchIsAttached(state),
    write: false
  }

  const summaries: Record<P2BStepId, string | null> = {
    start: titleAndLocation
      ? `${state.easySetupTitle.trim()} — ${state.easySetupLocation.trim()}`
      : null,
    direction: summarizeDirection(state),
    commission: summarizeCommission(state),
    research: summarizeResearch(state),
    write: null
  }

  const currentIndex = STEP_DEFINITIONS.findIndex(
    (definition) => !completion[definition.id]
  )

  return STEP_DEFINITIONS.map((definition, index) => ({
    id: definition.id,
    number: index + 1,
    name: definition.name,
    purpose: definition.purpose,
    state:
      completion[definition.id] && index < currentIndex
        ? 'done'
        : index === currentIndex
          ? 'current'
          : 'upcoming',
    summary: completion[definition.id] ? summaries[definition.id] : null
  }))
}

/** The step the operator is standing on. */
export function currentP2BStep(state: P2BFormState): P2BStep {
  const steps = deriveP2BSteps(state)
  return steps.find((step) => step.state === 'current') ?? steps[steps.length - 1]
}
