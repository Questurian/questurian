import { apiFetch } from '../../shared/api/client/apiFetch'
import type {
  ListicleAngleSelection,
  ListicleAttemptDetail,
  ListicleAttemptSummary,
  ListicleBoard,
  ListicleGoogleCheck,
  ListiclePlacesAllowance,
  ListicleGrillState,
  ListicleOrder,
  ListiclePrep,
  ListicleProfileResearch,
  ListicleProfileSummary,
  ListicleReadiness,
  ListicleResearchBlocker,
  ListicleResearchBoard,
  ListicleRunSummary,
  ListicleSearchResults,
  ListicleSourceLink,
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

/** Take a place off the board. `not_a_venue` only when Google said so;
 *  `by_hand` for the operator's own reasons. Reversible with Put back. */
export async function removeCandidate(
  runId: string,
  candidateId: string,
  reason: 'not_a_venue' | 'by_hand',
): Promise<ListicleBoard> {
  const response = await apiFetch(`${BASE}/board/${runId}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate_id: candidateId, reason }),
  })
  if (!response.ok) throw await readError(response, 'That place could not be removed.')
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

/** What Google has already said about this run's places. Never looks
 *  anything up. */
export async function loadGoogleChecks(
  runId: string,
): Promise<{ checks: Record<string, ListicleGoogleCheck>; running: boolean }> {
  const response = await apiFetch(`${BASE}/google/${runId}`)
  if (!response.ok) throw await readError(response, 'The Google checks could not be read.')
  return (await response.json()) as { checks: Record<string, ListicleGoogleCheck>; running: boolean }
}

/** Look up every place on the board Google has not answered for. Billed per
 *  place on the owner's Google Cloud account; a place already answered for is
 *  never asked again. */
export async function checkOnGoogle(
  runId: string,
): Promise<{ checks: Record<string, ListicleGoogleCheck>; asked: number; board?: ListicleBoard }> {
  const response = await apiFetch(`${BASE}/google/${runId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw await readError(response, 'The places could not be checked on Google.')
  // `board` comes back because a check can take permanently closed places
  // off it, and the screen has to show that without a second read.
  return (await response.json()) as {
    checks: Record<string, ListicleGoogleCheck>
    asked: number
    board?: ListicleBoard
  }
}

/** Free Google place lookups left this month. Reading it is free. */
export async function loadPlacesAllowance(refresh = false): Promise<ListiclePlacesAllowance> {
  const response = await apiFetch(`${BASE}/google-allowance${refresh ? '?refresh=true' : ''}`)
  if (!response.ok) throw await readError(response, "Google's count could not be read.")
  return (await response.json()) as ListiclePlacesAllowance
}

export async function loadSearch(runId: string): Promise<ListicleSearchResults | null> {
  const response = await apiFetch(`${BASE}/search/${runId}`)
  // A 404 here means "not run yet", which is a state and not a failure.
  if (response.status === 404) return null
  if (!response.ok) throw await readError(response, 'Those results could not be read.')
  return (await response.json()) as ListicleSearchResults
}

/* ------------------------------------------------------------------ *
 * Per-place research.
 *
 * One board read, one save per card, one research POST per press. The board
 * read is deliberately a single request: a profile call per card is
 * thirty-five requests to draw a screen somebody opens every time they come
 * back to the list.
 * ------------------------------------------------------------------ */

/** A request refused because the place is not ready. Carries the blockers, so
 *  the card can show what to fix instead of "that could not be done". Nothing
 *  was bought. */
export class ResearchBlockedError extends Error {
  blockers: ListicleResearchBlocker[]

  constructor(message: string, blockers: ListicleResearchBlocker[]) {
    super(message)
    this.blockers = blockers
  }
}

/** Something moved between being looked at and being acted on — the card was
 *  saved elsewhere, the order changed, or another request holds the one slot.
 *  Nothing was bought; re-read and decide again. */
export class ResearchConflictError extends Error {}

async function readResearchError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    const detail = body.detail
    if (typeof detail === 'string' && detail) {
      return response.status === 409
        ? new ResearchConflictError(detail)
        : new Error(detail)
    }
    if (detail && typeof detail === 'object') {
      const shaped = detail as { message?: string; blockers?: ListicleResearchBlocker[] }
      const message = shaped.message || fallback
      if (response.status === 422 && shaped.blockers) {
        return new ResearchBlockedError(message, shaped.blockers)
      }
      return response.status === 409
        ? new ResearchConflictError(message)
        : new Error(message)
    }
  } catch {
    // Not JSON. The fallback is the honest answer.
  }
  return new Error(fallback)
}

async function researchCall<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    const error = await readResearchError(response, 'That could not be done.')
    throw response.status === 404 ? new NotFoundError(error.message) : error
  }
  return (await response.json()) as T
}

/** Preparation, blockers and saved research for every place on one run.
 *
 *  A read. It never resolves an identity, creates a profile or reaches the
 *  web — opening a screen is not a decision to spend. */
export function loadResearchBoard(runId: string): Promise<ListicleResearchBoard> {
  return researchCall<ListicleResearchBoard>(`${BASE}/board/${runId}/research`)
}

/** Save one card's preparation. Every field is optional and absent means
 *  "leave it alone", so a checkbox saving on click cannot clear a URL box
 *  somebody is still typing in. */
export function saveCandidatePrep(
  runId: string,
  candidateId: string,
  patch: {
    expected_version?: number
    identity_confirmed?: boolean
    open_confirmed?: boolean
    status_note?: string
    exclusion_decision?: string
    exclusion_reason?: string
    cut_confirmed?: boolean
    tripadvisor_url?: string
    source_links?: ListicleSourceLink[]
  },
): Promise<{ prep: ListiclePrep; readiness: ListicleReadiness }> {
  return researchCall(`${BASE}/board/${runId}/candidates/${candidateId}/prep`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

/** One grounded research call about one place.
 *
 *  `idempotency_key` names this logical action. A lost response and a retried
 *  request carry the same key and return the same attempt; "Try again" makes a
 *  new key and says so before it is pressed.
 *
 *  Deliberately not given an AbortController: navigating away from the board
 *  must not cancel a call that has already been charged for. */
export function startPlaceResearch(
  runId: string,
  candidateId: string,
  body: {
    idempotency_key: string
    expected_prep_version?: number
    expected_order_revision?: number
    mode?: 'initial' | 'gap' | 'refresh'
    gap_text?: string
  },
): Promise<{
  attempt: ListicleAttemptSummary
  profile: ListicleProfileSummary | null
  repeated?: boolean
  reused?: boolean
}> {
  return researchCall(`${BASE}/board/${runId}/candidates/${candidateId}/research`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** How one request went. A read, and the way a reloaded page finds out. */
export function loadResearchAttempt(attemptId: string): Promise<ListicleAttemptDetail> {
  return researchCall<ListicleAttemptDetail>(`${BASE}/research-attempts/${attemptId}`)
}

/** Everything known about one place. Free to open, and free to reopen. */
export function loadProfileResearch(
  profileId: string,
  topic = '',
): Promise<ListicleProfileResearch> {
  const query = topic ? `?topic=${encodeURIComponent(topic)}` : ''
  return researchCall<ListicleProfileResearch>(
    `${BASE}/profiles/${profileId}/research${query}`,
  )
}

/** One finding, typed by a person. No provider call. */
export function addProfileFinding(
  profileId: string,
  body: Record<string, unknown>,
): Promise<ListicleProfileResearch> {
  return researchCall<ListicleProfileResearch>(`${BASE}/profiles/${profileId}/findings`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Correct a finding, or keep, discard or restore it. Discarding hides it from
 *  the writing material and deletes nothing. */
export function editProfileFinding(
  profileId: string,
  findingId: string,
  body: Record<string, unknown>,
): Promise<ListicleProfileResearch> {
  return researchCall<ListicleProfileResearch>(
    `${BASE}/profiles/${profileId}/findings/${findingId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
}

/** An editorial idea about a place. Explicitly not a fact. */
export function addPossibleAngle(
  profileId: string,
  body: { label: string; topic?: string; supporting_finding_ids?: string[] },
): Promise<ListicleProfileResearch> {
  return researchCall<ListicleProfileResearch>(
    `${BASE}/profiles/${profileId}/possible-angles`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

export function editPossibleAngle(
  profileId: string,
  angleId: string,
  body: { label?: string; topic?: string; archived?: boolean },
): Promise<ListicleProfileResearch> {
  return researchCall<ListicleProfileResearch>(
    `${BASE}/profiles/${profileId}/possible-angles/${angleId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
}
