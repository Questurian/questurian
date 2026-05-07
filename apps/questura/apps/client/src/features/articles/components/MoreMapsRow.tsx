import Link from 'next/link'
import type { MapsArticleTeaser } from '@/features/articles/lib/fetchMapsArticlesList'

interface MoreMapsRowProps {
  articles: MapsArticleTeaser[]
  country: string
  city: string
  currentSlug: string
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function MoreMapsRow({ articles, country, city, currentSlug }: MoreMapsRowProps) {
  const others = articles.filter((a) => a.slug !== currentSlug)

  if (others.length === 0) return null

  const cityLabel = capitalize(city)

  return (
    <div className="shrink-0 border-t border-black/10 bg-white px-4 pt-3 pb-16">
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <span className="font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[#3B5BDB]">
          More Maps in {cityLabel}
        </span>
        <Link
          href={`/${country}/${city}/maps`}
          className="font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold tracking-[0.04em] text-[#3B5BDB] hover:underline"
        >
          See more maps →
        </Link>
      </div>

      {/* Cards row */}
      <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {others.map((article) => {
          const imageUrl = article.header?.featuredImage?.url ?? null
          const href = `/${country}/${city}/maps/${article.slug}`

          return (
            <Link
              key={article.id}
              href={href}
              className="group flex w-[200px] shrink-0 gap-2.5"
            >
              <div className="h-[68px] w-[90px] shrink-0 overflow-hidden bg-[#e5e0d8]">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-90"
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
              </div>
              <p className="min-w-0 flex-1 font-[family-name:var(--font-dm-sans)] text-[0.72rem] font-semibold leading-[1.3] text-[#1a1a1a] group-hover:underline [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden">
                {article.title}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
