import { apiFetch } from '../../../shared/api/client/apiFetch'
import type { ItinerarySetupDraft } from '../types'
import { layoutSignature, tripSignature } from '../draft'
import type { DayWorkView, ImportPreview, WorkspaceView } from './types'

/**
 * One call per move the operator can make.
 *
 * Every day-scoped call returns the whole day rather than a fragment, for the
 * same reason the listicle interview returns the whole interview: the screen
 * is a view of where the work stands, and a screen that merges fragments into
 * its own copy is a screen that can be wrong in a way nobody can see.
 *
 * Three of these spend money — the two interview turns and the extraction —
 * and each takes an idempotency key the caller mints once per intent. The rest
 * are free, and that is a property of the server rather than a promise made
 * here: building the prompt, validating a paste and saving a result reach no
 * provider at all.
 */

const BASE = '/api/itinerary-pipeline'

/** A workspace, day or export that is not there. A different problem from a
 *  failed read, with a different next step. */
export class NotFoundError extends Error {}

/** Somebody moved this while you were deciding. Re-read, do not retry. */
export class ConflictError extends Error {}

async function readError(response: Response, fallback: string): Promise<Error> {
  let message = fallback
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string' && body.detail) message = body.detail
  } catch {
    // Not JSON. The fallback is the honest answer.
  }
  if (response.status === 404) return new NotFoundError(message)
  if (response.status === 409) return new ConflictError(message)
  return new Error(message)
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) throw await readError(response, 'That did not go through.')
  return (await response.json()) as T
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return call<T>(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/**
 * The setup, in the shape the backend's contract expects.
 *
 * The approval a day carries is sent as the pair of signatures the browser
 * recorded, never as a boolean. The server keeps its own signature of what
 * arrived and compares against that; the pair is how it tells a fresh approval
 * apart from the same approval arriving again.
 *
 * `ui` is deliberately not sent. Which tab is open and which stop is expanded
 * change constantly and mean nothing to a day's work; including them would put
 * a scroll position inside the fingerprint that decides whether a copied
 * prompt is still current.
 */
export function setupPayload(draft: ItinerarySetupDraft) {
  const trip = draft.trip
  return {
    draftId: draft.draftId,
    trip: {
      titleSeed: trip.titleSeed,
      baseCity: trip.baseCity,
      scope: trip.scope,
      timing: trip.timing,
      preferredAreas: trip.preferredAreas,
      startingBase: trip.startingBase,
      sharedPreferences: trip.sharedPreferences,
      getaway: trip.getaway,
    },
    days: draft.days.map(day => ({
      id: day.id,
      label: day.label,
      sourceTemplateName: day.sourceTemplateName,
      availableTime: day.availableTime,
      slots: day.slots.map(slot => ({
        id: slot.id,
        sourceSlotId: slot.sourceSlotId ?? '',
        kind: slot.kind,
        label: slot.label,
        daypart: slot.daypart,
        optional: slot.optional,
        purpose: slot.purpose,
        allowedCategories: slot.allowedCategories,
        preferredCategories: slot.preferredCategories,
        cues: slot.cues,
        exclusions: slot.exclusions,
        travel: slot.travel
          ? {
              from: slot.travel.from,
              to: slot.travel.to,
              mode: slot.travel.mode,
            }
          : null,
      })),
      setupNotes: day.setupNotes,
      preparationNotes: day.preparationNotes,
      tripRevision: day.approval?.tripRevision ?? '',
      layoutRevision: day.approval?.layoutRevision ?? '',
      approvedAt: day.approval?.approvedAt ?? '',
    })),
  }
}

/** Whether what the browser would send still matches what it approved. */
export function draftApprovalIsCurrent(draft: ItinerarySetupDraft): boolean {
  const trip = tripSignature(draft.trip)
  return draft.days.every(
    day =>
      day.approval?.tripRevision === trip &&
      day.approval?.layoutRevision === layoutSignature(day),
  )
}

export function createWorkspace(draft: ItinerarySetupDraft): Promise<WorkspaceView> {
  return post<WorkspaceView>(`${BASE}/workspaces`, { setup: setupPayload(draft) })
}

export function readWorkspace(workspaceId: string): Promise<WorkspaceView> {
  return call<WorkspaceView>(`${BASE}/workspaces/${workspaceId}`)
}

export function updateSetup(
  workspaceId: string,
  draft: ItinerarySetupDraft,
  expectedRevision: number | null,
): Promise<WorkspaceView> {
  return call<WorkspaceView>(`${BASE}/workspaces/${workspaceId}/setup`, {
    method: 'PATCH',
    body: JSON.stringify({
      setup: setupPayload(draft),
      ...(expectedRevision ? { expected_revision: expectedRevision } : {}),
    }),
  })
}

export function readDay(workspaceId: string, dayId: string): Promise<DayWorkView> {
  return call<DayWorkView>(`${BASE}/workspaces/${workspaceId}/days/${dayId}`)
}

function dayPath(workspaceId: string, dayId: string, tail: string): string {
  return `${BASE}/workspaces/${workspaceId}/days/${dayId}/${tail}`
}

export function startGrill(
  workspaceId: string,
  dayId: string,
  attemptKey: string,
): Promise<DayWorkView> {
  return post<DayWorkView>(dayPath(workspaceId, dayId, 'grill/start'), {
    attempt_key: attemptKey,
  })
}

export function answerGrill(
  workspaceId: string,
  dayId: string,
  answer: string,
  attemptKey: string,
): Promise<DayWorkView> {
  return post<DayWorkView>(dayPath(workspaceId, dayId, 'grill/answer'), {
    attempt_key: attemptKey,
    answer,
  })
}

export function reopenGrill(
  workspaceId: string,
  dayId: string,
  attemptKey: string,
): Promise<DayWorkView> {
  return post<DayWorkView>(dayPath(workspaceId, dayId, 'grill/reopen'), {
    attempt_key: attemptKey,
  })
}

export function prepareDirection(
  workspaceId: string,
  dayId: string,
  attemptKey: string,
): Promise<DayWorkView> {
  return post<DayWorkView>(dayPath(workspaceId, dayId, 'direction/prepare'), {
    attempt_key: attemptKey,
  })
}

export function acceptDirection(
  workspaceId: string,
  dayId: string,
  revision: number,
): Promise<DayWorkView> {
  return post<DayWorkView>(dayPath(workspaceId, dayId, 'direction/accept'), {
    revision,
  })
}

export function createExport(workspaceId: string, dayId: string): Promise<DayWorkView> {
  return post<DayWorkView>(dayPath(workspaceId, dayId, 'exports'))
}

/**
 * Start the day's research on the subscription.
 *
 * Returns as soon as the claim is written, not when the research is done — it
 * is minutes of searching and reading. The day is polled from there.
 */
export function startResearch(
  workspaceId: string,
  dayId: string,
  attemptKey: string,
): Promise<DayWorkView> {
  return post<DayWorkView>(dayPath(workspaceId, dayId, 'research'), {
    attempt_key: attemptKey,
  })
}

export function previewImport(
  workspaceId: string,
  dayId: string,
  raw: string,
): Promise<ImportPreview> {
  return post<ImportPreview>(dayPath(workspaceId, dayId, 'imports/preview'), { raw })
}

export function applyImport(
  workspaceId: string,
  dayId: string,
  raw: string,
  contentHash: string,
  importKey: string,
): Promise<DayWorkView> {
  return post<DayWorkView>(dayPath(workspaceId, dayId, 'imports/apply'), {
    raw,
    content_hash: contentHash,
    import_key: importKey,
  })
}

export function saveReview(
  workspaceId: string,
  dayId: string,
  notes: string,
  evidenceReviewed: boolean,
): Promise<DayWorkView> {
  return post<DayWorkView>(dayPath(workspaceId, dayId, 'review'), {
    notes,
    evidence_reviewed: evidenceReviewed,
  })
}

/**
 * A key for one intent, minted once and reused by every retry of it.
 *
 * `crypto.randomUUID` is not available in every context this runs in — an
 * insecure origin, or jsdom without the shim — and a key generator that throws
 * would take the whole screen down rather than the one call it belongs to.
 */
export function attemptKey(): string {
  const random = globalThis.crypto?.randomUUID?.()
  if (random) return random.replace(/-/g, '')
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}
