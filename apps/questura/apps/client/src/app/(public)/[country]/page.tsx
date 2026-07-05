import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { fetchCountryCities } from '@/features/CountryHub/lib/fetchCountryCities'
import { LocationContentList } from '@/features/search/components/LocationContentList'
import { fetchLocationContent } from '@/features/search/lib/fetchSearch'

const CONTENT_PAGE_SIZE = 50

type Props = {
  params: Promise<{ country: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country } = await params
  const data = await fetchCountryCities(country)

  if (!data) return {}

  const countryName = data.country.name ?? data.country.slug

  return {
    title: `${countryName} City Guides - Questurian`,
    description: `Browse Questurian city guides for ${countryName}.`,
    openGraph: {
      title: `${countryName} City Guides - Questurian`,
      url: `/${data.country.slug}`,
    },
  }
}

export default async function CountryHubPage({ params }: Props) {
  const { country } = await params
  const [data, content] = await Promise.all([
    fetchCountryCities(country),
    fetchLocationContent(country, 1, undefined, CONTENT_PAGE_SIZE),
  ])

  if (!data && !content) {
    notFound()
  }

  const countryName = data?.country.name ?? content?.location.label ?? country
  const cities = data?.cities ?? []

  return (
    <section className="min-h-[70vh] bg-background px-5 py-16 text-foreground 768:px-10 1024:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 1024:grid-cols-[minmax(0,0.82fr)_minmax(320px,0.68fr)] 1024:items-start">
          <div className="max-w-3xl">
            <h1 className="font-display text-[48px] font-medium leading-[0.95] text-foreground 480:text-[64px] 768:text-[84px]">
              {countryName}
            </h1>
          </div>

          {cities.length > 0 && (
            <div className="border-y border-foreground/18">
              {cities.map((city, index) => (
                <Link
                  key={city.slug}
                  href={city.href}
                  className="group flex min-h-20 items-center justify-between gap-4 border-b border-foreground/14 py-5 outline-none last:border-b-0 focus-visible:bg-foreground/5"
                >
                  <span className="flex min-w-0 items-baseline gap-4">
                    <span className="w-8 shrink-0 text-[11px] font-semibold text-foreground/38">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="break-words font-display text-[27px] leading-tight text-foreground 480:text-[34px]">
                      {city.name ?? city.slug}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="size-5 shrink-0 text-foreground/45 transition group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-foreground"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        {content && content.items.length > 0 && (
          <div className="mt-16 max-w-3xl">
            <LocationContentList
              content={content}
              pageHref={(page) =>
                `/search?location=${encodeURIComponent(content.location.locationKey)}&page=${page}`
              }
            />
          </div>
        )}
      </div>
    </section>
  )
}
