import type { StagedArticle } from '../../../types'
import {
  StagedDraftConflictError,
  putStagedDraft,
} from '../../../api/staged-drafts/staged-drafts.api'

export type StagedDraftConflict = {
  current: StagedArticle | null
}

export type StagedDraftSaveQueueOptions = {
  storageKey: string
  /** The server updatedAt of the draft as initially loaded/created. */
  initialServerUpdatedAt: string | null
  onConflict: (conflict: StagedDraftConflict) => void
  onError?: (error: unknown) => void
  debounceMs?: number
}

const DEFAULT_DEBOUNCE_MS = 750

/**
 * Serializes staged-draft saves for one draft.
 *
 * Mutations arrive per keystroke; a trailing debounce collapses them into one
 * PUT per typing pause, and a promise chain guarantees at most one PUT is in
 * flight so `expectedUpdatedAt` (the last server timestamp we saw) is always
 * accurate. On a 409 the queue stops accepting saves — local state has diverged
 * from the server and the caller must surface the conflict and reload.
 */
export class StagedDraftSaveQueue {
  private readonly storageKey: string
  private readonly onConflict: (conflict: StagedDraftConflict) => void
  private readonly onError?: (error: unknown) => void
  private readonly debounceMs: number

  private lastServerUpdatedAt: string | null
  private pendingDraft: StagedArticle | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> = Promise.resolve()
  private stopped = false

  constructor(options: StagedDraftSaveQueueOptions) {
    this.storageKey = options.storageKey
    this.lastServerUpdatedAt = options.initialServerUpdatedAt
    this.onConflict = options.onConflict
    this.onError = options.onError
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  }

  /** Queue a save of the given draft snapshot after the debounce window. */
  schedule(draft: StagedArticle): void {
    if (this.stopped) return
    this.pendingDraft = draft
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.enqueueSave()
    }, this.debounceMs)
  }

  /** Save the given draft snapshot immediately (still serialized behind in-flight saves). */
  saveNow(draft: StagedArticle): Promise<void> {
    if (this.stopped) return Promise.resolve()
    this.pendingDraft = draft
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    return this.enqueueSave()
  }

  /** Flush any pending debounced save and wait for in-flight saves to finish. */
  flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
      void this.enqueueSave()
    }
    return this.chain
  }

  /** Adopt a server timestamp obtained outside the queue (e.g. the create PUT). */
  adoptServerUpdatedAt(updatedAt: string): void {
    this.lastServerUpdatedAt = updatedAt
  }

  get isStopped(): boolean {
    return this.stopped
  }

  private enqueueSave(): Promise<void> {
    this.chain = this.chain.then(() => this.saveLatest())
    return this.chain
  }

  private async saveLatest(): Promise<void> {
    if (this.stopped) return
    const draft = this.pendingDraft
    if (!draft) return
    // Only the latest snapshot is sent; intermediate states are skipped, which
    // is correct because each PUT carries the whole document.
    this.pendingDraft = null

    try {
      const saved = await putStagedDraft(this.storageKey, draft, {
        expectedUpdatedAt: this.lastServerUpdatedAt ?? undefined,
      })
      this.lastServerUpdatedAt = saved.updatedAt
    } catch (error) {
      if (error instanceof StagedDraftConflictError) {
        this.stopped = true
        this.pendingDraft = null
        this.onConflict({ current: error.current })
        return
      }
      // Transient failure: keep the snapshot pending so the next mutation (or
      // flush) retries with it merged in, and report it non-fatally.
      this.pendingDraft = this.pendingDraft ?? draft
      this.onError?.(error)
    }
  }
}
