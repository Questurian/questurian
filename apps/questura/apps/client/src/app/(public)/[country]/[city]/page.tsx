import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  CityDashboardPage,
  CityHomepageContent,
  CityHomepagePayloadDebugLogger,
  fetchCityHomepage,
} from '@/features/CityDashboard';
import { LocationContentList } from '@/features/search/components/LocationContentList';
import { fetchLocationContent } from '@/features/search/lib/fetchSearch';

type Props = { params: Promise<{ country: string; city: string }> };
const CONTENT_PAGE_SIZE = 50;

function formatRouteLabel(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, city } = await params;

  const [data, content] = await Promise.all([
    fetchCityHomepage(country, city),
    fetchLocationContent(`${country}|${city}`, 1, undefined, CONTENT_PAGE_SIZE),
  ]);

  if (!data && !content) return {};

  const fallbackLabel = `${formatRouteLabel(city)}, ${formatRouteLabel(country)}`;
  const locationLabel = content?.location.label ?? fallbackLabel;

  return {
    title: `${locationLabel} — Questurian`,
    description: `Your guide to living in ${locationLabel}. Neighborhoods, accommodations, tours, and more.`,
    openGraph: {
      title: `${locationLabel} — Questurian`,
      url: `/${country}/${city}`,
    },
  };
}

export default async function CityPage({ params }: Props) {
  const { country, city } = await params;

  const [data, content] = await Promise.all([
    fetchCityHomepage(country, city),
    fetchLocationContent(`${country}|${city}`, 1, undefined, CONTENT_PAGE_SIZE),
  ]);

  if (!data && !content) {
    notFound();
  }

  if (!data && content) {
    return (
      <section className="min-h-[70vh] bg-background px-5 py-16 text-foreground 768:px-10 1024:px-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-8 font-display text-[48px] font-medium leading-[0.95] text-foreground 480:text-[64px] 768:text-[84px]">
            {content.location.label}
          </h1>

          {content.items.length > 0 ? (
            <LocationContentList
              content={content}
              pageHref={(page) =>
                `/search?location=${encodeURIComponent(content.location.locationKey)}&page=${page}`
              }
            />
          ) : null}
        </div>
      </section>
    );
  }

  if (!data) {
    notFound();
  }

  return (
    <>
      <CityHomepagePayloadDebugLogger data={data} />
      <CityHomepageContent pageBlocks={data.pageBlocks} />
      <CityDashboardPage citySlug={city} countrySlug={country} />
    </>
  );
}
