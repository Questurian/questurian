import { API_BASE_URL } from '../../../../shared/api/client/config'
import { parseErrorResponse } from '../../../../shared/api/client/error-parser'
import type { StagedArticle } from '../../types'

/**
 * Server-side persistence for staged article drafts. Drafts are stored in the
 * backend (SQLite) keyed by `storageKey` + draft `id`, so builder "Resume" links
 * resolve regardless of which browser/device created the draft. This replaces the
 * previous localStorage-only storage that made links non-portable.
 */

const STAGED_DRAFTS_URL = `${API_BASE_URL}/staged-drafts`

function draftsEndpoint(storageKey: string, draftId?: string): string {
  const base = draftId
    ? `${STAGED_DRAFTS_URL}/${encodeURIComponent(draftId)}`
    : STAGED_DRAFTS_URL
  return `${base}?storageKey=${encodeURIComponent(storageKey)}`
}

/**
 * Thrown when a conditional save loses to a concurrent write. `current` is the
 * draft as stored on the server now, or `null` if it was deleted.
 */
export class StagedDraftConflictError extends Error {
  current: StagedArticle | null

  constructor(current: StagedArticle | null) {
    super('Staged draft was modified by someone else')
    this.name = 'StagedDraftConflictError'
    this.current = current
  }
}

export type PutStagedDraftOptions = {
  /** When set, the server rejects the write with 409 if the stored draft's updatedAt no longer matches. */
  expectedUpdatedAt?: string
}

export async function fetchStagedDrafts(storageKey: string): Promise<StagedArticle[]> {
  const response = await fetch(draftsEndpoint(storageKey))
  if (!response.ok) {
    const message = await parseErrorResponse(response, `Failed to load staged drafts: ${response.status}`, { detail: 'Unknown error' })
    throw new Error(message)
  }
  const result = await response.json()
  return Array.isArray(result?.drafts) ? (result.drafts as StagedArticle[]) : []
}

export async function fetchStagedDraft(
  storageKey: string,
  draftId: string,
): Promise<StagedArticle | null> {
  const response = await fetch(draftsEndpoint(storageKey, draftId))
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    const message = await parseErrorResponse(response, `Failed to load staged draft: ${response.status}`, { detail: 'Unknown error' })
    throw new Error(message)
  }
  return (await response.json()) as StagedArticle
}

export async function putStagedDraft(
  storageKey: string,
  draft: StagedArticle,
  options?: PutStagedDraftOptions,
): Promise<StagedArticle> {
  let endpoint = draftsEndpoint(storageKey, draft.id)
  if (options?.expectedUpdatedAt) {
    endpoint += `&expectedUpdatedAt=${encodeURIComponent(options.expectedUpdatedAt)}`
  }
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })
  if (response.status === 409) {
    const body = await response.json().catch(() => null)
    throw new StagedDraftConflictError((body?.current as StagedArticle | null) ?? null)
  }
  if (!response.ok) {
    const message = await parseErrorResponse(response, `Failed to save staged draft: ${response.status}`, { detail: 'Unknown error' })
    throw new Error(message)
  }
  return (await response.json()) as StagedArticle
}

export async function deleteStagedDraft(storageKey: string, draftId: string): Promise<void> {
  const response = await fetch(draftsEndpoint(storageKey, draftId), { method: 'DELETE' })
  if (!response.ok && response.status !== 404) {
    const message = await parseErrorResponse(response, `Failed to delete staged draft: ${response.status}`, { detail: 'Unknown error' })
    throw new Error(message)
  }
}

export async function clearStagedDrafts(storageKey: string): Promise<void> {
  const response = await fetch(draftsEndpoint(storageKey), { method: 'DELETE' })
  if (!response.ok) {
    const message = await parseErrorResponse(response, `Failed to clear staged drafts: ${response.status}`, { detail: 'Unknown error' })
    throw new Error(message)
  }
}
