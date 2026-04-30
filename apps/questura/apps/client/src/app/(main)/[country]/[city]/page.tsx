import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  CityDashboardPage,
  CityHomepageContent,
  CityHomepagePayloadDebugLogger,
  fetchCityHomepage,
} from '@/features/CityDashboard';

const PRIMARY_COUNTRY = 'peru';
const PRIMARY_CITY = 'lima';

type Props = { params: Promise<{ country: string; city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, city } = await params;

  if (country !== PRIMARY_COUNTRY || city !== PRIMARY_CITY) {
    return {};
  }

  const cityLabel = 'Lima';
  const countryLabel = 'Peru';

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

  if (country !== PRIMARY_COUNTRY || city !== PRIMARY_CITY) {
    notFound();
  }

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
