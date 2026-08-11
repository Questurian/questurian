import type { PayloadRequest } from 'payload'

/**
 * Resolves the Author record that a staff account writes as (ADR-0007).
 *
 * Bylines point at `authors`, but everything that creates or scopes an article
 * knows only the logged-in `users` row, so this is the one place that crosses
 * between them. Keeping it in one place is deliberate: a second, slightly
 * different translation is how the two ids drift apart.
 */
export async function findAuthorIdForUser(
  req: PayloadRequest,
  userId: number | string,
): Promise<number | null> {
  const match = await req.payload.find({
    collection: 'authors',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const author = match.docs[0]
  return author ? (author.id as number) : null
}

/**
 * As above, but creates the Author record when the account has none.
 *
 * Used on article creation, where the byline is required: a new hire who has
 * never published has no author record yet, and refusing their first article
 * would be a worse failure than minting the record they are about to need. The
 * slug is left to `authorSlugHook`.
 */
export async function ensureAuthorIdForUser(
  req: PayloadRequest,
  userId: number | string,
): Promise<number | null> {
  const existing = await findAuthorIdForUser(req, userId)
  if (existing !== null) return existing

  const user = await req.payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
  })
  if (!user) return null

  const displayName =
    user.publicProfile?.displayName?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.email

  const created = await req.payload.create({
    collection: 'authors',
    data: {
      user: user.id,
      displayName,
      // The account's existing public profile comes across so a first article
      // does not publish under an empty author page.
      bio: user.publicProfile?.bio ?? undefined,
      avatar:
        typeof user.publicProfile?.avatar === 'number' ? user.publicProfile.avatar : undefined,
      socialLinks: user.publicProfile?.socialLinks ?? undefined,
    },
    overrideAccess: true,
    req,
  })

  return created.id as number
}
