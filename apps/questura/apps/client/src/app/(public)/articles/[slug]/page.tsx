import type { Metadata } from 'next'
import { renderStandardArticleRoute } from '@/features/articles/routes/renderStandardArticleRoute'
import { guardArticleSlug } from '@/lib/routing/guardReservedSegment'
import { buildArticleMetadata } from '@/features/articles/lib/buildArticleMetadata'
import { globalArticleParams } from '@/lib/routing/publicRouteParams'
import { publicUrlIndex } from '@/lib/routing/publicStaticParams'

// Pre-rendered at build time so a first visitor — often the crawler — is
// served a cached page instead of paying a live render. dynamicParams stays at
// its default, so a article published after the last deploy still renders on
// demand. See src/lib/routing/publicStaticParams.ts.
export async function generateStaticParams() {
  const { pages } = await publicUrlIndex()
  return globalArticleParams(pages)
}

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
