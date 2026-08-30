import { apiFetch } from '../../../shared/api/client/apiFetch'
import { parseError } from '../../../shared/api/errors/parse-error'
import { FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import type { IntakeState } from './intake.types'

/**
 * One call per move the operator can make.
 *
 * Every one returns the whole state rather than a fragment, because the page
 * is a view of where the run stands and not a thing that accumulates its own
 * copy of the truth.
 */

const INTAKE = `${FEATURE_PREFIX}/intake`

async function post(path: string, body?: unknown): Promise<IntakeState> {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw await parseError(response, 'That step could not be completed.')
  }
  return (await response.json()) as IntakeState
}

/** One typed line becomes a run and its first question. */
export function openIntake(seed: string): Promise<IntakeState> {
  return post(`${INTAKE}/seed`, { seed })
}

/** What a reloaded page asks for. */
export async function readIntake(runId: string): Promise<IntakeState> {
  const response = await apiFetch(`${INTAKE}/${runId}`)
  if (!response.ok) {
    throw await parseError(response, 'Could not read where this article stands.')
  }
  return (await response.json()) as IntakeState
}

export function answerQuestion(runId: string, answer: string): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/answer`, { answer })
}

/** Go back into the grill. The single way out of any dead end. */
export function reopenGrill(runId: string): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/reopen`)
}

export function approveBrief(runId: string): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/brief`)
}

export function planResearch(runId: string): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/work-order`)
}

/**
 * Apply the cut. The response carries what it cost, which is said once and
 * never enforced.
 */
export function cutWorkOrder(
  runId: string,
  struckIds: string[],
  addedQuestions: string[],
): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/work-order/cut`, {
    struck_ids: struckIds,
    added_questions: addedQuestions,
  })
}
