import Link from 'next/link'
import type { JSX } from 'react'
import type { AuthorArticleItem, PublicAuthor } from '@/features/authors/lib/fetchAuthor'
import { AuthorSocialIcons } from '@/features/authors/components/AuthorSocialLinks'
import { AuthorAvatar } from '@/features/authors/components/AuthorAvatar'

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

function SectionHeading({ label }: { label: string }): JSX.Element {
  return (
    <div className="border-b border-foreground pb-2">
      <h2 className="font-display text-[18px] font-semibold uppercase tracking-[0.06em] text-foreground sm:text-[20px]">
        {label}
      </h2>
    </div>
  )
}

function Byline({ name, publishedAt }: { name: string; publishedAt: string | null }): JSX.Element {
  const dateLine = formatDate(publishedAt)
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.12em]">
      <p className="font-semibold text-foreground">{name}</p>
      {dateLine ? <p className="mt-0.5 text-foreground/60">{dateLine}</p> : null}
    </div>
  )
}

function ArticleThumbnail({
  thumbnail,
  className,
}: {
  thumbnail: AuthorArticleItem['thumbnail']
  className?: string
}): JSX.Element | null {
  if (!thumbnail?.url) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbnail.url}
      alt={thumbnail.alt ?? ''}
      className={className}
      loading="lazy"
      decoding="async"
    />
  )
}

function FeaturedArticle({
  article,
  authorName,
}: {
  article: AuthorArticleItem
  authorName: string
}): JSX.Element {
  return (
    <section aria-label="Featured article" className="mt-12">
      <SectionHeading label="Featured" />
      <Link
        href={article.href}
        className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10"
      >
        <div className="flex flex-1 flex-col items-center text-center">
          <h3 className="font-display text-[26px] font-semibold leading-[1.2] text-foreground sm:text-[30px]">
            {article.title}
          </h3>
          {article.excerpt ? (
            <p className="mt-4 max-w-[52ch] font-display text-[15px] leading-[1.5] text-foreground/85 sm:text-[16px]">
              {article.excerpt}
            </p>
          ) : null}
          <div className="mt-5">
            <Byline name={authorName} publishedAt={article.publishedAt} />
          </div>
        </div>
        {article.thumbnail?.url ? (
          <div className="w-full sm:w-1/2">
            <ArticleThumbnail
              thumbnail={article.thumbnail}
              className="aspect-[3/2] w-full object-cover"
            />
          </div>
        ) : null}
      </Link>
    </section>
  )
}

function LatestArticleRow({
  article,
  authorName,
}: {
  article: AuthorArticleItem
  authorName: string
}): JSX.Element {
  return (
    <Link
      href={article.href}
      className="flex items-start gap-5 border-b border-foreground/15 py-8 sm:gap-8"
    >
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[20px] font-semibold leading-[1.25] text-foreground sm:text-[24px]">
          {article.title}
        </h3>
        {article.excerpt ? (
          <p className="mt-2 font-display text-[14px] leading-[1.5] text-foreground/80 sm:text-[15px]">
            {article.excerpt}
          </p>
        ) : null}
        <div className="mt-4">
          <Byline name={authorName} publishedAt={article.publishedAt} />
        </div>
      </div>
      {article.thumbnail?.url ? (
        <div className="w-[110px] shrink-0 sm:w-[220px]">
          <ArticleThumbnail
            thumbnail={article.thumbnail}
            className="aspect-square w-full object-cover sm:aspect-[3/2]"
          />
        </div>
      ) : null}
    </Link>
  )
}


export function AuthorPage({ author }: { author: PublicAuthor }): JSX.Element {
  const name = author.displayName ?? 'Questurian'
  const [featured, ...latest] = author.articles
  // Placeholder bio until a real bio is stored for every author.
  const bio = author.bio ?? `${name} is a contributing writer at Questurian.`

  return (
    <div className="bg-background">
      <header className="bg-[#ece9e3]">
        <div className="mx-auto flex w-full max-w-[920px] items-center gap-6 px-4 py-12 sm:gap-10 sm:px-6 sm:py-16">
          <AuthorAvatar avatar={author.avatar} name={name} />
          <div className="min-w-0">
            <h1 className="font-display text-[34px] font-bold uppercase leading-[1.05] tracking-[0.01em] text-foreground sm:text-[44px]">
              {name}
            </h1>
            <p className="mt-4 max-w-[62ch] font-display text-[16px] leading-[1.5] text-foreground/85 sm:text-[18px]">
              {bio}
            </p>
            <div className="mt-6">
              <AuthorSocialIcons links={author.socialLinks} authorName={name} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] px-4 py-12 sm:px-6">
        {featured ? <FeaturedArticle article={featured} authorName={name} /> : null}

        {latest.length > 0 ? (
          <section aria-label="Latest articles" className="mx-auto mt-16 max-w-[880px]">
            <SectionHeading label="Latest" />
            <div>
              {latest.map((article) => (
                <LatestArticleRow key={`${article.href}`} article={article} authorName={name} />
              ))}
            </div>
          </section>
        ) : null}

        {author.articles.length === 0 ? (
          <p className="py-16 text-center font-display text-[16px] text-foreground/60">
            No published articles yet.
          </p>
        ) : null}
      </main>
    </div>
  )
}
