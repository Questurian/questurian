import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { fetchCountryCities } from '@/features/CountryHub/lib/fetchCountryCities'

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
  const data = await fetchCountryCities(country)

  if (!data) {
    notFound()
  }

  const countryName = data.country.name ?? data.country.slug

  return (
    <section className="min-h-[70vh] bg-background px-5 py-16 text-foreground 768:px-10 1024:px-16">
      <div className="mx-auto grid max-w-6xl gap-12 1024:grid-cols-[minmax(0,0.82fr)_minmax(320px,0.68fr)] 1024:items-start">
        <div className="max-w-3xl">
          <p className="mb-5 text-[11px] font-semibold uppercase leading-none tracking-[0.28em] text-foreground/55">
            Questurian city directory
          </p>
          <h1 className="font-display text-[48px] font-medium leading-[0.95] text-foreground 480:text-[64px] 768:text-[84px]">
            {countryName}
          </h1>
          <p className="mt-7 max-w-xl text-[16px] leading-7 text-foreground/68 768:text-[18px]">
            Choose a city to find local guides, maps, itineraries, and practical
            travel intelligence.
          </p>
        </div>

        <div className="border-y border-foreground/18">
          {data.cities.map((city, index) => (
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
      </div>
    </section>
  )
}
