import { apiFetch } from '../../shared/api/client/apiFetch'
import type {
  ListicleAngleSelection,
  ListicleGrillState,
  ListicleOrder,
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

/** Correct the agreement. The correction becomes a new revision, so results
 *  gathered under the old one cannot be shown as answers to the new one. */
export async function reviseOrder(
  runId: string,
  patch: { target_count?: number; angles?: ListicleOrder['angles'] },
): Promise<ListicleOrder> {
  const response = await apiFetch(`${BASE}/order/${runId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw await readError(response, 'That correction was refused.')
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

export async function loadSearch(runId: string): Promise<ListicleSearchResults | null> {
  const response = await apiFetch(`${BASE}/search/${runId}`)
  // A 404 here means "not run yet", which is a state and not a failure.
  if (response.status === 404) return null
  if (!response.ok) throw await readError(response, 'Those results could not be read.')
  return (await response.json()) as ListicleSearchResults
}
