import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { fetchAuthor } from '@/features/authors/lib/fetchAuthor'
import { authorPath } from '@/features/authors/lib/authorPath'
import { AuthorPage } from '@/features/authors/AuthorPage'

type Props = {
  params: Promise<{ slug: string }>
}

const VALID_PARAM = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$|^\d+$/

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!VALID_PARAM.test(slug)) return {}
  const author = await fetchAuthor(slug)
  if (!author?.displayName) return {}
  return {
    title: author.displayName,
    description: author.bio ?? undefined,
    alternates: {
      canonical: authorPath(author) ?? undefined,
    },
  }
}

export default async function AuthorRoute({ params }: Props) {
  const { slug } = await params
  if (!VALID_PARAM.test(slug)) notFound()

  const author = await fetchAuthor(slug)
  if (!author) notFound()

  // Legacy /authors/<numeric-id> URLs 301 to the canonical slug URL
  if (author.slug && author.slug !== slug) {
    permanentRedirect(`/authors/${author.slug}`)
  }

  return <AuthorPage author={author} />
}
