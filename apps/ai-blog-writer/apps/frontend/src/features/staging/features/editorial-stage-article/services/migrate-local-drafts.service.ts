import type { StagedArticle } from '../../../types'
import { putStagedDraft } from '../../../api/staged-drafts/staged-drafts.api'
import { normalizeStagedArticle } from './editorial-stage-storage.service'

/**
 * One-time migration of legacy localStorage-only staged drafts to the server.
 *
 * Staged drafts used to live purely in `localStorage[storageKey]`, which made
 * builder "Resume" links non-portable. Now the backend owns them. On first load
 * for a given storage key we push any locally-cached drafts up (idempotent on
 * draft id), then clear the local key so it never runs twice.
 */

function migratedFlagKey(storageKey: string): string {
  return `${storageKey}__migrated_to_server`
}

export async function migrateLocalDraftsToServer(storageKey: string): Promise<void> {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(migratedFlagKey(storageKey))) return

  const stored = localStorage.getItem(storageKey)
  if (!stored) {
    // Nothing to migrate; still mark done so we don't re-check every load.
    localStorage.setItem(migratedFlagKey(storageKey), '1')
    return
  }

  try {
    const parsed = JSON.parse(stored)
    const drafts: StagedArticle[] = Array.isArray(parsed)
      ? parsed
          .map((entry) => normalizeStagedArticle(entry))
          .filter((entry): entry is StagedArticle => Boolean(entry))
      : []

    for (const draft of drafts) {
      await putStagedDraft(storageKey, draft)
    }

    // Only clear the local copy once every draft has been persisted server-side.
    localStorage.removeItem(storageKey)
    localStorage.setItem(migratedFlagKey(storageKey), '1')
  } catch {
    // Leave the local data and the flag unset so migration is retried next load.
  }
}
