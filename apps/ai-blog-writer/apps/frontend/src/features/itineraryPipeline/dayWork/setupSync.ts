import { useEffect, useRef } from 'react'
import { setupPayload, updateSetup } from './api'
import type { ItinerarySetupDraft } from '../types'

/**
 * Setup edits reach the server on their own — but only edits.
 *
 * Changing a hotel or a note after a proposal exists has to show up as "this
 * changed" without waiting for the next paid move. The first version pushed
 * whatever a tab held whenever the day screen opened, so an old tab opened
 * later silently overwrote a newer setup from another browser (it removed a
 * hotel on 2026-09-17). So the first setup a page load sees for a workspace is
 * taken as what the server already has, and only changes made after that, in
 * this page load, are sent. Every paid move still pushes first (`ensureLinked`).
 *
 * Mounted once, at page level, so an edit made on another stage is pushed too.
 */

const SETUP_SYNC_MS = 700

/** What each workspace is believed to hold, as this page load last saw or sent it. */
const known = new Map<string, string>()

export const SETUP_PUSHED_EVENT = 'ip-setup-pushed'

export interface SetupPushedDetail {
  workspaceId: string
  revision: number | null
}

export function signatureOf(draft: ItinerarySetupDraft): string {
  return JSON.stringify(setupPayload(draft))
}

/** Record that the server now holds this setup (after a push elsewhere). */
export function noteSent(workspaceId: string, draft: ItinerarySetupDraft): void {
  known.set(workspaceId, signatureOf(draft))
}

/** Test seam: forget everything this page load has seen. */
export function resetSetupSync(): void {
  known.clear()
}

export function useSetupSync(draft: ItinerarySetupDraft, loading: boolean): void {
  const workspaceId = draft.workspaceId ?? null
  const signature = workspaceId && !loading ? signatureOf(draft) : ''
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    if (!workspaceId || !signature) return
    if (!known.has(workspaceId)) {
      known.set(workspaceId, signature)
      return
    }
    if (known.get(workspaceId) === signature) return
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await updateSetup(workspaceId, draftRef.current, null)
          known.set(workspaceId, signature)
          const detail: SetupPushedDetail = {
            workspaceId,
            revision: typeof result?.revision === 'number' ? result.revision : null,
          }
          window.dispatchEvent(new CustomEvent(SETUP_PUSHED_EVENT, { detail }))
        } catch {
          // The server is away or another tab moved it. The next move pushes
          // the setup again before it asks anything.
        }
      })()
    }, SETUP_SYNC_MS)
    return () => clearTimeout(timer)
  }, [workspaceId, signature])
}
