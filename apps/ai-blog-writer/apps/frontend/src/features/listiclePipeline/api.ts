import { apiFetch } from '../../shared/api/client/apiFetch'
import type { ListicleGrillState, ListicleSearchResults } from './types'

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

async function call(
  path: string,
  init?: RequestInit,
): Promise<ListicleGrillState> {
  const response = await apiFetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    throw await readError(response, 'That turn could not be completed.')
  }
  return (await response.json()) as ListicleGrillState
}

export function startGrill(seed: string): Promise<ListicleGrillState> {
  return call(`${BASE}/grill/start`, {
    method: 'POST',
    body: JSON.stringify({ seed }),
  })
}

export function answerGrill(runId: string, answer: string): Promise<ListicleGrillState> {
  return call(`${BASE}/grill/answer`, {
    method: 'POST',
    body: JSON.stringify({ run_id: runId, answer }),
  })
}

export function loadGrill(runId: string): Promise<ListicleGrillState> {
  return call(`${BASE}/grill/${runId}`)
}


/**
 * Run the agreed search order, or read what a previous run found.
 *
 * Running is minutes of grounded searching and real tokens, so it is only ever
 * something the operator asks for -- `loadSearch` is what a screen calls when
 * it opens.
 */
export async function runSearch(runId: string): Promise<ListicleSearchResults> {
  const response = await apiFetch(`${BASE}/search/${runId}`, { method: 'POST' })
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
