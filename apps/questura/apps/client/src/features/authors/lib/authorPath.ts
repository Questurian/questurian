export type AuthorRef = {
  slug?: string | null
  id?: number | string | null
}

/**
 * Canonical public author-page path. Prefers the SEO-friendly slug
 * (/authors/jane-doe); falls back to the numeric id only for authors that
 * don't have a slug yet (those URLs 301 to the slug once one exists).
 */
export function authorPath(author: AuthorRef): string | null {
  const slug = typeof author.slug === 'string' && author.slug ? author.slug : null
  const id = author.id ?? null
  const segment = slug ?? (id !== null ? String(id) : null)
  return segment ? `/authors/${segment}` : null
}
