import type { JSX } from 'react'
import { ArticlePageHeader } from '@/features/articles/components/ArticlePageHeader'
import { InstagramEmbedBlock } from '@/features/articles/components/InstagramEmbedBlock'
import { ListicleVenueInfoGrid } from '@/features/articles/components/ListicleVenueInfoGrid'
import {
  listicleItemHeroFromRow,
  priceLevelLabel,
} from '@/features/articles/lib/listicleItemHelpers'
import { listicleInstagramEmbedCode } from '@/features/articles/lib/listicleInstagram'
import type { MapsListicleArticle } from '@/features/articles/types/mapsListicle'

type MapsListicleArticlePageProps = {
  article: MapsListicleArticle
}

function ListicleEntry({
  row,
  index,
}: {
  row: NonNullable<MapsListicleArticle['items']>[number]
  index: number
}): JSX.Element {
  const hero = listicleItemHeroFromRow(row)
  const price = priceLevelLabel(row.item.priceLevel)
  const cuisines = row.item.cuisines?.filter(Boolean) ?? []
  const idealFor = row.item.idealFor?.filter(Boolean) ?? []
  const blurb = row.blurb
  const instagramCode = listicleInstagramEmbedCode(row)

  const metaParts = [
    price,
    cuisines[0],
    cuisines[1],
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)

  return (
    <li className="scroll-mt-4 border-t border-foreground/10 first:border-t-0 first:pt-0 pt-7 pb-1 max-[379px]:pt-6">
      <div className="min-w-0 space-y-3 380:space-y-3.5">
        {hero ? (
          <div className="-mx-0 overflow-hidden rounded-sm bg-foreground/[0.04]">
            <div className="aspect-[16/10] w-full 380:aspect-[4/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.url}
                alt={hero.alt}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <h2 className="font-display text-[1.15rem] font-semibold leading-[1.2] text-foreground 380:text-[1.35rem]">
            <span className="font-semibold text-foreground">
              {index + 1}.
            </span>{' '}
            {row.item.title}
          </h2>

          {metaParts.length > 0 ? (
            <p className="flex flex-wrap items-center text-[11px] leading-snug 380:text-[12px]">
              {metaParts.map((part, i) => (
                <span key={`${part}-${i}`} className="inline-flex items-center">
                  {i > 0 ? (
                    <span
                      className="mx-2 shrink-0 text-foreground/18"
                      aria-hidden
                    >
                      |
                    </span>
                  ) : null}
                  <span className="font-medium text-[var(--maps-listicle-accent)]">
                    {part}
                  </span>
                </span>
              ))}
            </p>
          ) : null}

          {idealFor.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="inline-flex min-h-7 shrink-0 items-center justify-center px-1.5 py-1 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.06em] text-white [overflow-wrap:anywhere] rounded-none bg-[var(--maps-listicle-accent)] 380:min-h-8 380:px-2 380:py-1 380:text-[10px]">
                Ideal for
              </span>
              {idealFor.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex min-h-7 w-fit max-w-full min-w-0 items-center justify-center break-words px-1.5 py-1 text-center text-[9px] font-medium leading-tight text-foreground/85 [overflow-wrap:anywhere] rounded-none bg-[var(--maps-listicle-chip)] 380:min-h-8 380:px-2 380:py-1 380:text-[10px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {blurb ? (
          <div
            className="article-prose maps-listicle-blurb maps-listicle-venue-blurb max-w-none pb-1"
            dangerouslySetInnerHTML={{ __html: blurb }}
          />
        ) : null}

        <ListicleVenueInfoGrid item={row.item} />

        {instagramCode ? (
          <div className="-mx-1 flex w-full min-w-0 justify-center pt-1">
            <InstagramEmbedBlock
              embedCode={instagramCode}
              captionMode="hide"
              className="w-full max-w-[540px]"
            />
          </div>
        ) : null}
      </div>
    </li>
  )
}

export function MapsListicleArticlePage({
  article,
}: MapsListicleArticlePageProps): JSX.Element {
  const description =
    article.seoSection?.metaDescription ?? article.seoSection?.seoTitle
  const featuredImage = article.header?.featuredImage
  const introRaw = article.header?.intro
  const introHtml = typeof introRaw === 'string' ? introRaw : null

  const items = article.items ?? []

  return (
    <article className="min-h-screen bg-background">
      <ArticlePageHeader
        title={article.title}
        description={description}
        publishedAt={article.publishedAt}
      />

      {featuredImage?.url ? (
        <div className="px-0 sm:px-4 max-[379px]:px-0">
          <div className="aspect-[4/3] w-full overflow-hidden max-[379px]:aspect-[5/4]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={featuredImage.url}
              alt={featuredImage.alt_text ?? ''}
              className="h-full w-full object-cover"
              fetchPriority="high"
              decoding="async"
            />
          </div>
        </div>
      ) : null}

      {introHtml ? (
        <div className="px-3 pt-6 pb-2 380:px-4 380:pt-8 380:pb-3">
          <div
            className="article-prose maps-listicle-intro max-w-none"
            dangerouslySetInnerHTML={{ __html: introHtml }}
          />
        </div>
      ) : null}

      <div className="px-3 pb-20 pt-4 380:px-4 380:pt-6">
        <ol className="m-0 list-none p-0">
          {items.map((row, i) => (
            <ListicleEntry key={row.id} row={row} index={i} />
          ))}
        </ol>
      </div>
    </article>
  )
}
