import { apiFetch } from '../../../shared/api/client/apiFetch'
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

/**
 * Read whatever the server actually said.
 *
 * The shared `parseError` only reads `detail` when it is a string. Intake
 * answers a failure with an object -- a message written for a person plus the
 * raw model reply -- so every one of those messages was being thrown away and
 * replaced with a generic fallback. The operator saw "That step could not be
 * completed" while the server was explaining exactly what went wrong.
 */
async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null)
  const detail = body?.detail

  if (typeof detail === 'string' && detail) return new Error(detail)
  if (detail && typeof detail === 'object') {
    const message = typeof detail.message === 'string' ? detail.message : fallback
    const error = new Error(message)
    // Kept on the error so a screen can offer it without the message carrying
    // a wall of JSON.
    Object.assign(error, { raw: detail.raw, code: detail.error })
    return error
  }
  return new Error(fallback)
}

async function post(path: string, body?: unknown): Promise<IntakeState> {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw await readError(response, 'That step could not be completed.')
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
    throw await readError(response, 'Could not read where this article stands.')
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

/** Both research passes, then the one gate that blocks. */
export function doResearch(runId: string): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/research`)
}
