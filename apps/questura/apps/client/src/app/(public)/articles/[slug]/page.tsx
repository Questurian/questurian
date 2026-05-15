import type { Metadata } from 'next'
import { renderStandardArticleRoute } from '@/features/articles/routes/renderStandardArticleRoute'
import { guardArticleSlug } from '@/lib/routing/guardReservedSegment'
import { buildArticleMetadata } from '@/features/articles/lib/buildArticleMetadata'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return buildArticleMetadata({ scope: { kind: 'global' }, type: 'articles', slug })
}

export default async function GlobalArticlePage({ params }: Props) {
  const { slug } = await params
  guardArticleSlug(slug)

  return renderStandardArticleRoute({ scope: { kind: 'global' }, slug })
}
