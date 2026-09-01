import { apiFetch } from '../../../shared/api/client/apiFetch'
import { FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import type {
  GateQuestion,
  IntakeArticle,
  IntakeRunSummary,
  IntakeState,
  VenueToCheck,
} from './intake.types'

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
 *
 * The status travels on the error too. Without it every failure looked the
 * same to the caller, and the resume read treated a timeout as proof the run
 * no longer existed.
 */
async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null)
  const detail = body?.detail

  const withStatus = (error: Error): Error =>
    Object.assign(error, { status: response.status })

  if (typeof detail === 'string' && detail) return withStatus(new Error(detail))
  if (detail && typeof detail === 'object') {
    const message = typeof detail.message === 'string' ? detail.message : fallback
    const error = new Error(message)
    // Kept on the error so a screen can offer it without the message carrying
    // a wall of JSON.
    Object.assign(error, { raw: detail.raw, code: detail.error })
    return withStatus(error)
  }
  return withStatus(new Error(fallback))
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

/**
 * The runs the operator can go back to.
 *
 * Without this the page could only ever reach the one run its browser
 * remembered, and every earlier one needed a `?run=<id>` URL dug out of the
 * database by hand.
 */
export async function listRuns(): Promise<IntakeRunSummary[]> {
  const response = await apiFetch(`${INTAKE}/runs`)
  if (!response.ok) {
    throw await readError(response, 'Could not list recent articles.')
  }
  const body = (await response.json()) as { runs?: IntakeRunSummary[] }
  return body.runs ?? []
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

/**
 * Hand the settled run to the writer.
 *
 * The same run id all the way through: the article is written onto the run the
 * seed opened, so the receipt covers intake and writing together. Answers 202
 * — the graph runs in the background and the page follows the run from there.
 */
export function startWriting(runId: string): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/write`)
}

/**
 * The finished article, for reading.
 *
 * Its own call because the state above is polled every few seconds while the
 * graph runs, and this is several hundred kilobytes.
 */
export async function readArticle(runId: string): Promise<IntakeArticle> {
  const response = await apiFetch(`${INTAKE}/${runId}/article`)
  if (!response.ok) {
    throw await readError(response, 'Could not read the finished article.')
  }
  return (await response.json()) as IntakeArticle
}

/**
 * The prompt to carry to a flagship model, with the article already in it.
 *
 * Generated, never hand edited: operator influence belongs in a control with
 * its own validated field, or nothing downstream can say what was asked for.
 */
export async function readPolishPrompt(runId: string): Promise<{ prompt: string }> {
  const response = await apiFetch(`${INTAKE}/${runId}/polish-prompt`)
  if (!response.ok) {
    throw await readError(response, 'Could not build the polish prompt.')
  }
  return (await response.json()) as { prompt: string }
}

/** The questions holding this run up, with what research did find. */
export async function readGate(runId: string): Promise<{ blocking: GateQuestion[] }> {
  const response = await apiFetch(`${INTAKE}/${runId}/gate`)
  if (!response.ok) {
    throw await readError(response, 'Could not read what is holding this up.')
  }
  return (await response.json()) as { blocking: GateQuestion[] }
}

/**
 * Settle one blocking question without re-buying the research.
 *
 * Either an answer, or a note saying it is not published anywhere. No model
 * call: this is the operator's decision, recorded.
 */
export function settleGate(
  runId: string,
  body: {
    requirement_id: string
    answer?: string
    source_url?: string
    unpublished_note?: string
    omit?: boolean
  },
): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/gate`, body)
}

/**
 * Rewrite one research question and buy one search.
 *
 * The only move at the gate that spends money. The other three record a
 * decision the operator already made; this one asks the web again, because the
 * question was fine and the answer was about the wrong place.
 */
export function reaskQuestion(
  runId: string,
  body: { requirement_id: string; question: string },
): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/gate/reask`, body)
}

/** The places this run would send a reader, for a person to look at. */
export async function readVenues(runId: string): Promise<{ venues: VenueToCheck[] }> {
  const response = await apiFetch(`${INTAKE}/${runId}/venues`)
  if (!response.ok) {
    throw await readError(response, 'Could not read the places to check.')
  }
  return (await response.json()) as { venues: VenueToCheck[] }
}

/** Record what the operator saw. Drop it, or say what you found. */
export function markVenue(
  runId: string,
  body: { claim_id: string; drop?: boolean; note?: string },
): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/venues`, body)
}
