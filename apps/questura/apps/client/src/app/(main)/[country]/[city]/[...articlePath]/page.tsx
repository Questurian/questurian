import { notFound } from 'next/navigation';

const KNOWN_TYPES = ['maps', 'itinerary', 'guide', 'food', 'neighborhoods'] as const;
type ArticleType = (typeof KNOWN_TYPES)[number];

function parseArticlePath(segments: string[]): {
  type: ArticleType | null;
  slug: string;
} | null {
  if (segments.length === 1) {
    return { type: null, slug: segments[0] };
  }

  if (segments.length === 2 && KNOWN_TYPES.includes(segments[0] as ArticleType)) {
    return { type: segments[0] as ArticleType, slug: segments[1] };
  }

  return null;
}

type Props = {
  params: Promise<{ country: string; city: string; articlePath: string[] }>;
};

export default async function ArticlePage({ params }: Props) {
  const { country, city, articlePath } = await params;

  const parsed = parseArticlePath(articlePath);

  if (!parsed) {
    notFound();
  }

  const { type, slug } = parsed;

  const url = type
    ? `/${country}/${city}/${type}/${slug}`
    : `/${country}/${city}/${slug}`;

  console.log('[ArticlePage] params:', { country, city, type, slug, url });

  // TODO: fetch article data here when ready
  // const article = await fetchArticle({ country, city, type, slug });

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>Article Route Ready</h1>
      <pre>{JSON.stringify({ country, city, type, slug, url }, null, 2)}</pre>
      <p>Fetch will go here — check console for params.</p>
    </div>
  );
}
