import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  CityDashboardPage,
  CityHomepageContent,
  CityHomepagePayloadDebugLogger,
  fetchCityHomepage,
} from '@/features/CityDashboard';

type Props = { params: Promise<{ country: string; city: string }> };

function formatRouteLabel(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, city } = await params;

  const data = await fetchCityHomepage(country, city);

  if (!data) return {};

  const cityLabel = formatRouteLabel(city);
  const countryLabel = formatRouteLabel(country);

  return {
    title: `${cityLabel}, ${countryLabel} — Questurian`,
    description: `Your guide to living in ${cityLabel}. Neighborhoods, accommodations, tours, and more.`,
    openGraph: {
      title: `${cityLabel}, ${countryLabel} — Questurian`,
      url: `/${country}/${city}`,
    },
  };
}

export default async function CityPage({ params }: Props) {
  const { country, city } = await params;

  const data = await fetchCityHomepage(country, city);

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
