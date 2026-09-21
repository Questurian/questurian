import { describe, expect, it, vi } from 'vitest'

import { Articles } from '@/features/articles/articles/collections/Articles'
import { ListicleItineraries } from '@/features/articles/listicle-itineraries/collections'
import { SingleTypeListicles } from '@/features/articles/single-type-listicles/collections'

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

function recordingReq() {
  const statements: Array<{ sql: string; values: unknown[] }> = []
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values })
      return { rows: [], rowCount: 0 }
    },
    release: () => {},
  }

  return {
    statements,
    req: {
      payload: {
        db: {
          pool: {
            query: client.query,
            connect: async () => client,
          },
        },
      },
    } as never,
  }
}

describe('search index hook registration', () => {
  for (const [slug, collection, typeKey] of SEARCHABLE_COLLECTIONS) {
    it(`${slug} writes its search row on change`, async () => {
      const { req, statements } = recordingReq()

      for (const hook of collection.hooks?.afterChange ?? []) {
        await hook({ doc: { id: 12 }, req, operation: 'update' } as never)
      }

      const touched = statements.filter((statement) =>
        statement.sql.includes('public_search_documents'),
      )
      expect(touched.length, `${slug} never touched public_search_documents`).toBeGreaterThan(0)
      expect(touched.some((statement) => statement.values[0] === typeKey)).toBe(true)
      expect(touched.some((statement) => statement.values[1] === 12)).toBe(true)
    })

    it(`${slug} removes its search row on delete`, async () => {
      const { req, statements } = recordingReq()

      for (const hook of collection.hooks?.afterDelete ?? []) {
        await hook({ doc: { id: 12 }, req } as never)
      }

      const deletes = statements.filter((statement) =>
        statement.sql.includes('DELETE FROM public_search_documents'),
      )
      expect(deletes.length, `${slug} never removed its search row`).toBeGreaterThan(0)
      expect(deletes[0]?.values).toEqual([typeKey, 12])
    })
  }
})
