import { apiFetch } from '../../shared/api/client/apiFetch'
import type {
  ListicleAngleSelection,
  ListicleBoard,
  ListicleGrillState,
  ListicleOrder,
  ListicleRunSummary,
  ListicleSearchResults,
} from './types'

/**
 * One call per move the operator can make.
 *
 * Every one returns the whole interview rather than a fragment, because the
 * page is a view of where the run stands and not a thing that accumulates its
 * own copy of the truth.
 */

const BASE = '/api/listicle-pipeline'

/**
 * Read whatever the server actually said.
 *
 * A failed turn is the interesting case here: the operator has to be able to
 * tell "the model could not decide what to ask" from "nothing happened", and
 * a generic fallback throws that away.
 */
async function readError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string' && body.detail) return new Error(body.detail)
  } catch {
    // Not JSON. The fallback is the honest answer.
  }
  return new Error(fallback)
}

/** A run that is not there. Distinguished so a screen can say "this run does
 *  not exist" instead of "something went wrong", which are different problems
 *  with different next steps. */
export class NotFoundError extends Error {}

async function call(
  path: string,
  init?: RequestInit,
): Promise<ListicleGrillState> {
  const response = await apiFetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    const error = await readError(response, 'That turn could not be completed.')
    throw response.status === 404 ? new NotFoundError(error.message) : error
  }
  return (await response.json()) as ListicleGrillState
}

export function startGrill(seed: string): Promise<ListicleGrillState> {
  return call(`${BASE}/grill/start`, {
    method: 'POST',
    body: JSON.stringify({ seed }),
  })
}

export function answerGrill(
  runId: string,
  answer: string,
  selections: ListicleAngleSelection[] = [],
): Promise<ListicleGrillState> {
  return call(`${BASE}/grill/answer`, {
    method: 'POST',
    body: JSON.stringify({ run_id: runId, answer, selections }),
  })
}

export function loadGrill(runId: string): Promise<ListicleGrillState> {
  return call(`${BASE}/grill/${runId}`)
}


/**
 * The agreement, as the searches will run it.
 *
 * Read rather than derived from the consensus paragraph. What the operator sees
 * and what the searches do now come from one record, which is the whole fix for
 * a run that displayed twenty and searched for forty.
 */
export async function loadOrder(runId: string): Promise<ListicleOrder | null> {
  const response = await apiFetch(`${BASE}/order/${runId}`)
  // Not agreed yet is a state, not a failure.
  if (response.status === 404) return null
  if (!response.ok) throw await readError(response, 'The search order could not be read.')
  return (await response.json()) as ListicleOrder
}

/** A correction typed against a version of the order that has since moved.
 *
 *  Its own class because it has its own next step: nothing is broken and
 *  retrying the same body would apply the correction over whatever happened in
 *  between. The screen re-reads and shows the operator the order that exists. */
export class RevisionConflictError extends Error {}

/** Correct the agreement. The correction becomes a new revision, so results
 *  gathered under the old one cannot be shown as answers to the new one.
 *
 *  `expected_revision` is the revision the screen was showing. The server
 *  refuses a correction written against a version that has moved rather than
 *  applying it over the intervening one — two tabs, or a tab left open while
 *  the interview re-agreed, are the ordinary way that happens. */
export async function reviseOrder(
  runId: string,
  patch: {
    target_count?: number
    angles?: ListicleOrder['angles']
    standard?: string
    exclusions?: string
    expected_revision?: number
  },
): Promise<ListicleOrder> {
  const response = await apiFetch(`${BASE}/order/${runId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) {
    const error = await readError(response, 'That correction was refused.')
    throw response.status === 409
      ? new RevisionConflictError(error.message)
      : error
  }
  return (await response.json()) as ListicleOrder
}


/**
 * Run the agreed search order, or read what this run already knows.
 *
 * Running is minutes of grounded searching and real tokens, so it is only ever
 * something the operator asks for -- `loadSearch` is what a screen calls when
 * it opens, and it never searches.
 *
 * `angleIds` runs a named subset, which is how a retry costs one search rather
 * than six. `reuse: false` is the deliberate full refresh.
 */
export async function runSearch(
  runId: string,
  options: { angleIds?: string[]; reuse?: boolean } = {},
): Promise<ListicleSearchResults> {
  const response = await apiFetch(`${BASE}/search/${runId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      angle_ids: options.angleIds ?? [],
      reuse: options.reuse ?? true,
    }),
  })
  if (!response.ok) throw await readError(response, 'The search could not be run.')
  return (await response.json()) as ListicleSearchResults
}

/** Buy the part of the cut review that is still missing.
 *
 *  Its own call because it costs. A partial review retries only its unjudged
 *  chunks; a pool already covered is returned as it stands with no call at
 *  all. */
export async function recheckCut(runId: string): Promise<ListicleSearchResults> {
  const response = await apiFetch(`${BASE}/recheck/${runId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw await readError(response, 'The cut check could not be run.')
  return (await response.json()) as ListicleSearchResults
}

/** Every saved run and how far it got. A read: nothing is searched or rebuilt
 *  by looking at the shelf. */
export async function listRuns(includeHidden = false): Promise<ListicleRunSummary[]> {
  const query = includeHidden ? '?include_hidden=true' : ''
  const response = await apiFetch(`${BASE}/runs${query}`)
  if (!response.ok) throw await readError(response, 'The saved lists could not be read.')
  const body = (await response.json()) as { runs: ListicleRunSummary[] }
  return body.runs
}

/** Take a run off the shelf or put it back. The run itself is untouched. */
export async function setRunHidden(runId: string, hidden: boolean): Promise<void> {
  const response = await apiFetch(`${BASE}/runs/${runId}/hidden`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden }),
  })
  if (!response.ok) throw await readError(response, 'That list could not be moved.')
}

/** Duplicate decisions for one run. A read. */
export async function loadBoard(runId: string): Promise<ListicleBoard> {
  const response = await apiFetch(`${BASE}/board/${runId}`)
  if (!response.ok) throw await readError(response, 'The duplicate decisions could not be read.')
  return (await response.json()) as ListicleBoard
}

/** Settle one duplicate warning. `same` places other than `keep` come off the
 *  board; `different` places stop being flagged against this one. */
export async function resolveDuplicates(
  runId: string,
  answer: { candidate_id: string; same: string[]; different: string[]; keep: string },
): Promise<ListicleBoard> {
  const response = await apiFetch(`${BASE}/board/${runId}/duplicates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(answer),
  })
  if (!response.ok) throw await readError(response, 'That answer could not be saved.')
  return (await response.json()) as ListicleBoard
}

/** Put a removed place back on the board. */
export async function restoreCandidate(runId: string, candidateId: string): Promise<ListicleBoard> {
  const response = await apiFetch(`${BASE}/board/${runId}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate_id: candidateId }),
  })
  if (!response.ok) throw await readError(response, 'That place could not be put back.')
  return (await response.json()) as ListicleBoard
}

export async function loadSearch(runId: string): Promise<ListicleSearchResults | null> {
  const response = await apiFetch(`${BASE}/search/${runId}`)
  // A 404 here means "not run yet", which is a state and not a failure.
  if (response.status === 404) return null
  if (!response.ok) throw await readError(response, 'Those results could not be read.')
  return (await response.json()) as ListicleSearchResults
}
