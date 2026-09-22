import { describe, expect, it, vi } from 'vitest'

import { Articles } from '@/features/articles/articles/collections/Articles'
import { ListicleItineraries } from '@/features/articles/listicle-itineraries/collections'
import { SingleTypeListicles } from '@/features/articles/single-type-listicles/collections'
import { fakeTransactionalReq } from '@/test-utils'

vi.mock('@/features/refresh-outbox/drain-soon', () => ({ scheduleDrain: vi.fn() }))

vi.mock('@/features/public-revalidation/revalidate-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/public-revalidation/revalidate-client')>()
  return {
    ...actual,
    revalidateArticleCollection: () => ({
      afterChange: async ({ doc }: { doc: unknown }) => doc,
      afterDelete: async ({ doc }: { doc: unknown }) => doc,
    }),
  }
})

/**
 * Every searchable collection must actually run the sync hooks.
 *
 * This exists because `single-type-listicles` did not. The constant was
 * declared and never added to the hook arrays, which typechecks, passes every
 * unit test of the hook itself, and fails only as maps going quietly stale in
 * search until somebody rebuilt the index. A unit test of the hook cannot see
 * that; only a test of the registration can — and only one that runs the hooks
 * rather than counting them, because counting passes for the wrong hook too.
 */
const SEARCHABLE_COLLECTIONS = [
  ['articles', Articles, 'articles'],
  ['single-type-listicles', SingleTypeListicles, 'maps'],
  ['listicle-itineraries', ListicleItineraries, 'itineraries'],
] as const

/**
 * The hooks record an obligation in the save's transaction rather than
 * writing `public_search_documents` themselves, so this now asserts the
 * enqueued job. The registration question is unchanged: does each searchable
 * collection actually run the hook, and does it carry the right type key?
 */
function recordingReq() {
  const { req, sql } = fakeTransactionalReq()
  return { req, sql }
}

describe('search index hook registration', () => {
  for (const [slug, collection, typeKey] of SEARCHABLE_COLLECTIONS) {
    it(`${slug} owes a search refresh on change`, async () => {
      const { req, sql } = recordingReq()

      for (const hook of collection.hooks?.afterChange ?? []) {
        await hook({ doc: { id: 12 }, req, operation: 'update' } as never)
      }

      expect(sql(), `${slug} never enqueued a refresh job`).toContain('INSERT INTO refresh_jobs')
      expect(sql(), `${slug} enqueued the wrong search type`).toContain(`search:${typeKey}:12`)
    })

    it(`${slug} owes a search refresh on delete`, async () => {
      const { req, sql } = recordingReq()

      for (const hook of collection.hooks?.afterDelete ?? []) {
        await hook({ doc: { id: 12 }, req } as never)
      }

      expect(sql(), `${slug} never enqueued a delete refresh`).toContain(`search:${typeKey}:12`)
      expect(sql()).toContain(`${typeKey}:delete`)
    })
  }
})
