import type { ComponentType } from 'react'
import { ArticlePage } from '@/features/articles/ArticlePage'
import type { Article } from '@/features/articles/types'
import type { ArticleLayoutKey } from '@/features/articles/lib/articleRoute'

/** Layouts for URL types other than `maps` (maps uses {@link MapsArticleLayout} in the page). */
export type StandardArticleLayoutKey = Exclude<ArticleLayoutKey, 'maps'>

const registry: Record<
  StandardArticleLayoutKey,
  ComponentType<{ article: Article }>
> = {
  default: ArticlePage,
  itinerary: ArticlePage,
  guide: ArticlePage,
  food: ArticlePage,
  neighborhoods: ArticlePage,
}

export function getArticleLayoutComponent(
  layoutKey: StandardArticleLayoutKey,
): ComponentType<{ article: Article }> {
  return registry[layoutKey]
}
