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

/**
 * The flat content list, fetched only when there is no homepage row to render.
 *
 * It used to sit in a `Promise.all` next to `fetchCityHomepage` on every view,
 * which meant a curated city page fetched fifty articles it never displayed —
 * and, worse, inherited that fetch's 300s revalidate. Next takes the shortest
 * revalidate in a render, so the whole route rebuilt every five minutes
 * instead of every hour. Both fetches now agree on an hour, and this one only
 * happens on the path that reads it.
 */
function fetchFallbackContent(country: string, city: string) {
  return fetchLocationContent(
    `${country}|${city}`,
    1,
    undefined,
    CONTENT_PAGE_SIZE,
    'public-page',
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, city } = await params;

  // The homepage endpoint carries the location's display name, so a curated
  // city needs no second call to learn what it is called.
  const data = await fetchCityHomepage(country, city);
  const content = data ? null : await fetchFallbackContent(country, city);

  if (!data && !content) return {};

  const fallbackLabel = `${formatRouteLabel(city)}, ${formatRouteLabel(country)}`;
  const locationLabel =
    data?.location?.label ?? content?.location.label ?? fallbackLabel;

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

  const data = await fetchCityHomepage(country, city);

  if (!data) {
    const content = await fetchFallbackContent(country, city);
    if (!content) {
      notFound();
    }

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

  return (
    <>
      {/* Dev-only, and gated here rather than inside the component: a client
          component's props are serialized into the HTML whether or not its
          body does anything, so an internal NODE_ENV check still shipped the
          entire homepage payload — 56 kB, a fifth of the page — to every
          reader. This branch is statically false in a production build, so
          the element and its prop are never rendered. */}
      {process.env.NODE_ENV === 'development' ? (
        <CityHomepagePayloadDebugLogger data={data} />
      ) : null}
      <CityHomepageContent pageBlocks={data.pageBlocks} />
      <CityDashboardPage citySlug={city} countrySlug={country} />
    </>
  );
}
