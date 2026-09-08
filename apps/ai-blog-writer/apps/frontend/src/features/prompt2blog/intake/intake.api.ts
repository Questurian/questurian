import { apiFetch } from '../../../shared/api/client/apiFetch'
import { FEATURE_PREFIX } from '../constants/prompt2blog.constants'
import type {
  GateQuestion,
  IntakeArticle,
  IntakeDraft,
  IntakeReviewResult,
  IntakeRunSummary,
  IntakeState,
  ProvenanceReport,
  PunchList,
  SectionEditAction,
  SectionEditProposal,
  SelectionReview,
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

/**
 * Freeze the brief into the writer's assignment.
 *
 * Costs nothing: no model is asked to write this and no page is fetched, so
 * pressing it twice is not two assignments. It exists so the exact text can be
 * read before anything is bought.
 */
export function generatePrompt(runId: string): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/prompt`)
}

/**
 * Send the frozen prompt to the researching writer.
 *
 * Returns as soon as the run is claimed, not when the article is done. The
 * claim is written server-side before this responds, so a double click finds
 * it already there rather than buying a second article.
 */
export function generateArticle(runId: string): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/generate`)
}

/**
 * File an article written somewhere else against this run.
 *
 * The frozen prompt is a copy-paste artifact, so it can be taken to any model.
 * This is the way back: once the article is on the run, the review, Saved
 * Articles and staging all work on it unchanged. Costs nothing and calls
 * nothing, and it never overwrites a draft the run already has.
 */
export function pasteDraft(
  runId: string,
  markdown: string,
  writtenBy: string,
): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/draft`, {
    markdown,
    written_by: writtenBy,
  })
}

/** The article, once there is one. Its own call: this is the whole text. */
export async function readDraft(runId: string): Promise<IntakeDraft> {
  const response = await apiFetch(`${INTAKE}/${runId}/draft`)
  if (!response.ok) {
    throw await readError(response, 'Could not read the article.')
  }
  return (await response.json()) as IntakeDraft
}

/**
 * Read the finished draft and say what is wrong with it.
 *
 * Detection only: nothing here proposes replacement text and nothing applies a
 * change. It spends, so it is never called on a poll or a mount.
 */
export function reviewDraft(runId: string): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/review`)
}

/** The findings, once there are some. Its own call: this is every quote. */
export async function readReview(runId: string): Promise<IntakeReviewResult> {
  const response = await apiFetch(`${INTAKE}/${runId}/review`)
  if (!response.ok) {
    throw await readError(response, 'Could not read the review.')
  }
  return (await response.json()) as IntakeReviewResult
}

/**
 * Record what the operator makes of one finding.
 *
 * Costs nothing and changes nothing about the article. `null` clears a verdict
 * rather than recording a third opinion.
 */
export async function settleFinding(
  runId: string,
  reviewId: string,
  findingId: string,
  verdict: 'agreed' | 'not_a_fault' | null,
): Promise<IntakeReviewResult> {
  const response = await apiFetch(
    `${INTAKE}/${runId}/review/${reviewId}/finding/${findingId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict }),
    },
  )
  if (!response.ok) {
    throw await readError(response, 'Could not record that.')
  }
  return (await response.json()) as IntakeReviewResult
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
 * An answer, a note saying nobody publishes it, a note saying the thing is not
 * there, or a drop. No model call: this is the operator's decision, recorded.
 */
export function settleGate(
  runId: string,
  body: {
    requirement_id: string
    answer?: string
    source_url?: string
    unpublished_note?: string
    nonexistent_note?: string
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

/**
 * The short list of edits a person should make by hand.
 *
 * One model call the first time it is asked for, then read from the run, so
 * this is slow once and instant afterwards.
 */
export async function readPunchList(runId: string): Promise<PunchList> {
  const response = await apiFetch(`${INTAKE}/${runId}/punch-list`)
  if (!response.ok) {
    throw await readError(response, 'Could not read the notes on this article.')
  }
  return (await response.json()) as PunchList
}

/**
 * Where each passage of the finished article came from.
 *
 * Answers 409 for a run that never recorded the packet its writer was given,
 * which is every run from before this existed. That is not an error to retry.
 */
export async function readProvenance(runId: string): Promise<ProvenanceReport> {
  const response = await apiFetch(`${FEATURE_PREFIX}/provenance/${runId}`)
  if (!response.ok) {
    throw await readError(response, 'Could not read where this article came from.')
  }
  return (await response.json()) as ProvenanceReport
}

/** Record that a person read this passage against this material and agreed. */
export async function confirmProvenance(
  runId: string,
  link: { passage_hash: string; source_kind: 'claim' | 'material'; source_id: string },
): Promise<void> {
  const response = await apiFetch(`${FEATURE_PREFIX}/provenance/${runId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(link),
  })
  if (!response.ok) {
    throw await readError(response, 'Could not record that check.')
  }
}

/** The improvements an editor may ask for. */
export async function readEditActions(): Promise<{ actions: SectionEditAction[] }> {
  const response = await apiFetch(`${FEATURE_PREFIX}/section-edit/actions`)
  if (!response.ok) {
    throw await readError(response, 'Could not read the available edits.')
  }
  return (await response.json()) as { actions: SectionEditAction[] }
}

/** Ask for one change to one section. Spends a model call; writes nothing. */
export async function proposeSectionEdit(
  runId: string,
  body: { section_id: string; action_id: string },
): Promise<SectionEditProposal> {
  const response = await apiFetch(`${FEATURE_PREFIX}/section-edit/${runId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw await readError(response, 'Could not draft that change.')
  }
  return (await response.json()) as SectionEditProposal
}

/**
 * Write an accepted proposal into the draft.
 *
 * `reason` is optional and nothing is inferred from its absence. It is the
 * difference between "this one was wrong" and "we always want this", and only
 * the person pressing the button knows which they meant.
 */
export async function applySectionEdit(
  runId: string,
  proposal: SectionEditProposal,
  reason = '',
  acceptFindings = false,
): Promise<{
  markdown: string
  edits: number
  revision: number
  review_status: string
  already_applied: boolean
}> {
  const response = await apiFetch(`${FEATURE_PREFIX}/section-edit/${runId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposal, reason, accept_findings: acceptFindings }),
  })
  if (!response.ok) {
    throw await readError(response, 'Could not apply that change.')
  }
  return (await response.json()) as {
    markdown: string
    edits: number
    revision: number
    review_status: string
    already_applied: boolean
  }
}

/**
 * Put the draft back to what it was before the last applied edit.
 *
 * `baseRevision` is which version of the article this screen is looking at.
 * Undo is a write like any other: pressed on a stale screen, an unguarded one
 * restores the markdown from before *this tab's* last edit and erases whatever
 * somebody else saved in between.
 */
export async function undoSectionEdit(
  runId: string,
  baseRevision = -1,
): Promise<{
  markdown: string
  edits: number
  undone: boolean
  revision: number
}> {
  const response = await apiFetch(`${FEATURE_PREFIX}/section-edit/${runId}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_revision: baseRevision }),
  })
  if (!response.ok) {
    throw await readError(response, 'Could not undo the last change.')
  }
  return (await response.json()) as {
    markdown: string
    edits: number
    undone: boolean
    revision: number
  }
}

/** The places this run would send a reader, for a person to look at. */
export async function readVenues(runId: string): Promise<{ venues: VenueToCheck[] }> {
  const response = await apiFetch(`${INTAKE}/${runId}/venues`)
  if (!response.ok) {
    throw await readError(response, 'Could not read the places to check.')
  }
  return (await response.json()) as { venues: VenueToCheck[] }
}

/**
 * Record what the operator saw. Exactly one move per call: drop it, dismiss it
 * as never worth checking, or say what you found.
 */
export function markVenue(
  runId: string,
  body: { claim_id: string; drop?: boolean; dismiss?: boolean; note?: string },
): Promise<IntakeState> {
  return post(`${INTAKE}/${runId}/venues`, body)
}

/** The facts this article would be written from, ranked, with the line. */
export async function readSelection(runId: string): Promise<SelectionReview> {
  const response = await apiFetch(`${INTAKE}/${runId}/selection`)
  if (!response.ok) {
    throw await readError(response, 'Could not read the facts for this article.')
  }
  return (await response.json()) as SelectionReview
}

/**
 * Move the line, or mark one fact. Exactly one per call — an override is about
 * that fact and outlives the line moving past it, so the two are separate
 * decisions rather than one combined write.
 */
export async function reviseSelection(
  runId: string,
  body: { keep_count?: number; rescue?: string; drop?: string; clear?: string },
): Promise<SelectionReview> {
  const response = await apiFetch(`${INTAKE}/${runId}/selection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw await readError(response, 'Could not change which facts are kept.')
  }
  return (await response.json()) as SelectionReview
}

