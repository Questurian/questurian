import type { CollectionBeforeChangeHook } from 'payload'

export function slugifyAuthorName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Generates the public author-page slug (/authors/<slug>) from the display
 * name (falling back to first + last name). Runs on every save so users
 * created before the slug column existed pick one up on their next update.
 *
 * Purely numeric slugs are prefixed with "author-" because /authors/<numeric>
 * is reserved for legacy id-based URLs that 301 to the slug.
 */
export const authorSlugHook: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (!data) return data

  const explicit =
    typeof data.slug === 'string' && data.slug.trim() ? slugifyAuthorName(data.slug) : null
  const existing =
    typeof originalDoc?.slug === 'string' && originalDoc.slug ? originalDoc.slug : null

  // Keep stable URLs: never regenerate an existing slug unless one was typed in
  if (!explicit && existing) {
    if ('slug' in data) delete data.slug
    return data
  }

  let base = explicit
  if (!base) {
    const displayName =
      data.publicProfile?.displayName || originalDoc?.publicProfile?.displayName || ''
    const firstName = data.firstName ?? originalDoc?.firstName ?? ''
    const lastName = data.lastName ?? originalDoc?.lastName ?? ''
    const source = displayName || [firstName, lastName].filter(Boolean).join(' ')
    base = source ? slugifyAuthorName(source) : null
  }
  if (!base) return data

  if (/^\d+$/.test(base)) base = `author-${base}`

  let candidate = base
  for (let n = 2; ; n += 1) {
    const match = await req.payload.find({
      collection: 'users',
      where: { slug: { equals: candidate } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const taken = match.docs[0]
    if (!taken || (originalDoc?.id !== undefined && taken.id === originalDoc.id)) break
    candidate = `${base}-${n}`
  }

  data.slug = candidate
  return data
}
