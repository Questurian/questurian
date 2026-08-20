import type { Article } from '../types'
import type { ArticleScope } from './articleScope'
import { fetchArticleIndex, type ArticleIndexItem } from './fetchArticleIndex'

const TRENDING_COUNT = 5
const PARTNERS_COUNT = 5

function scopesFromLocation(location: string | undefined): ArticleScope[] {
  const parts = (location ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)

  const scopes: ArticleScope[] = []
  if (parts.length >= 2) scopes.push({ kind: 'city', country: parts[0], city: parts[1] })
  if (parts.length >= 1) scopes.push({ kind: 'country', country: parts[0] })
  scopes.push({ kind: 'global' })
  return scopes
}

async function indexForScope(scope: ArticleScope): Promise<ArticleIndexItem[]> {
  try {
    const data = await fetchArticleIndex({ scope, type: 'articles', page: 1, pageSize: 20 })
    return data?.items ?? []
  } catch {
    return []
  }
}

async function firstNonEmptyIndex(
  scopes: ArticleScope[],
  article: Article,
  path?: string,
): Promise<ArticleIndexItem[]> {
  for (const scope of scopes) {
    const items = excludeCurrent(await indexForScope(scope), article, path)
    if (items.length > 0) return items
  }
  return []
}

function excludeCurrent(
  items: ArticleIndexItem[],
  article: Article,
  path?: string,
): ArticleIndexItem[] {
  return items.filter((item) => {
    if (item.slug === article.slug) return false
    if (path && item.href === path) return false
    return true
  })
}

export type ArticleSidebarLists = {
  trending: ArticleIndexItem[]
  partners: ArticleIndexItem[]
}

export async function fetchStandardArticleSidebar(
  article: Article,
  path?: string,
): Promise<ArticleSidebarLists> {
  const scopes = scopesFromLocation(article.location)
  const localItems = await firstNonEmptyIndex(scopes, article, path)
  const trending = localItems.slice(0, TRENDING_COUNT)
  const trendingIds = new Set(trending.map((item) => String(item.id)))

  let partnerPool: ArticleIndexItem[]
  if (scopes[0]?.kind === 'global') {
    partnerPool = localItems.slice(TRENDING_COUNT)
  } else {
    const globalItems = excludeCurrent(await indexForScope({ kind: 'global' }), article, path).filter(
      (item) => !trendingIds.has(String(item.id)),
    )
    partnerPool = globalItems.length > 0 ? globalItems : localItems.slice(TRENDING_COUNT)
  }

  return {
    trending,
    partners: partnerPool.slice(0, PARTNERS_COUNT),
  }
}
