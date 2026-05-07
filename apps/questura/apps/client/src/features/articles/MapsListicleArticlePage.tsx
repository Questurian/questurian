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
    <li className="scroll-mt-4 border-t border-foreground/10 first:border-t-0 first:pt-0 pt-7 pb-1 max-[379px]:pt-6 480:pt-9 550:pt-11 sm:pt-12 768:pt-14">
      <div className="min-w-0 space-y-3 380:space-y-3.5 480:space-y-4 sm:space-y-5">
        {hero ? (
          <div className="overflow-hidden rounded-sm bg-foreground/[0.04]">
            <div className="aspect-[16/10] w-full 380:aspect-[4/3] 480:aspect-[3/2] sm:aspect-[16/9]">
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

        <div className="space-y-2 480:space-y-2.5 sm:space-y-3">
          <h2 className="font-display text-[1.15rem] font-semibold leading-[1.2] text-foreground 380:text-[1.35rem] 480:text-[1.5rem] 550:text-[1.55rem] sm:text-[1.7rem] 768:text-[1.8rem]">
            <span className="font-semibold text-foreground">
              {index + 1}.
            </span>{' '}
            {row.item.title}
          </h2>

          {metaParts.length > 0 ? (
            <p className="flex flex-wrap items-center text-[11px] leading-snug 380:text-[12px] 480:text-[13px] sm:text-[14px]">
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
            <div className="flex flex-wrap gap-1.5 pt-0.5 480:gap-2 sm:gap-2.5">
              <span className="inline-flex min-h-7 shrink-0 items-center justify-center px-1.5 py-1 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.06em] text-white [overflow-wrap:anywhere] rounded-none bg-[var(--maps-listicle-accent)] 380:min-h-8 380:px-2 380:text-[10px] 480:min-h-9 480:px-2.5 480:text-[11px] sm:min-h-[38px] sm:px-3 sm:text-[12px]">
                Ideal for
              </span>
              {idealFor.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex min-h-7 w-fit max-w-full min-w-0 items-center justify-center break-words px-1.5 py-1 text-center text-[9px] font-medium leading-tight text-foreground/85 [overflow-wrap:anywhere] rounded-none bg-[var(--maps-listicle-chip)] 380:min-h-8 380:px-2 380:text-[10px] 480:min-h-9 480:px-2.5 480:text-[11px] sm:min-h-[38px] sm:px-3 sm:text-[12px]"
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
          <div className="-mx-1 flex w-full min-w-0 justify-center pt-1 480:pt-2 sm:pt-3">
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
  const featuredImage = article.header?.featuredImage
  const introRaw = article.header?.intro
  const introHtml = typeof introRaw === 'string' ? introRaw : null

  const items = article.items ?? []

  return (
    <article className="min-h-screen bg-background sm:max-w-[600px] sm:mx-auto 1024:max-w-none 1024:mx-0 1024:border-t 1024:border-foreground/10">
      <ArticlePageHeader
        title={article.title}
        author={article.author}
      />

      {introHtml ? (
        <div className="px-3 pt-6 pb-2 380:px-4 380:pt-8 380:pb-3 480:px-5 480:pt-10 480:pb-4 550:px-6 sm:px-8 sm:pt-10 sm:pb-5 768:px-10">
          <div
            className="article-prose maps-listicle-intro max-w-none"
            dangerouslySetInnerHTML={{ __html: introHtml }}
          />
        </div>
      ) : null}

      {featuredImage?.url ? (
        <div className="px-0 480:px-4 480:pb-1 sm:px-0 sm:pb-2">
          <div className="aspect-[5/4] w-full overflow-hidden 380:aspect-[4/3] 480:rounded-sm sm:aspect-[3/2] sm:rounded">
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

      <div className="px-3 pb-20 pt-4 380:px-4 380:pt-6 480:px-5 480:pt-8 480:pb-24 550:px-6 550:pt-10 sm:px-8 sm:pt-8 sm:pb-32 768:px-10">
        <ol className="m-0 list-none p-0">
          {items.map((row, i) => (
            <ListicleEntry key={row.id} row={row} index={i} />
          ))}
        </ol>
      </div>
    </article>
  )
}
