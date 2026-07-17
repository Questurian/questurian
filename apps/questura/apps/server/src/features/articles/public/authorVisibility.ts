import type { Payload } from 'payload'

import { TYPE_TO_COLLECTION, type ArticleTypeKey } from './scope'

export type AuthorContentCounter = Pick<Payload, 'count'>

/**
 * Byline implies visibility: an author page is publicly visible iff the Staff
 * identity has at least one published editorial item in ANY language. There is
 * no opt-in flag (the legacy `isPublic` checkbox is retired) — see the Domain
 * Rules in apps/questura/CONTEXT.md.
 */
export async function hasPublishedAuthorContent(
  payload: AuthorContentCounter,
  authorId: number | string,
  types: ArticleTypeKey[],
): Promise<boolean> {
  const counts = await Promise.all(
    types.map((type) =>
      payload.count({
        collection: TYPE_TO_COLLECTION[type],
        where: {
          and: [
            { author: { equals: authorId } },
            { status: { equals: 'published' } },
          ],
        },
        overrideAccess: true,
      }),
    ),
  )

  return counts.some((result) => result.totalDocs > 0)
}
