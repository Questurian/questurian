import { notFound } from 'next/navigation';
import { fetchArticle } from '@/features/articles/lib/fetchArticle';
import { ArticlePage } from '@/features/articles/ArticlePage';

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

export default async function ArticleRoutePage({ params }: Props) {
  const { country, city, articlePath } = await params;

  const parsed = parseArticlePath(articlePath);

  if (!parsed) {
    notFound();
  }

  const { type, slug } = parsed;

  const article = await fetchArticle({ country, city, type, slug });

  if (!article) {
    notFound();
  }

  return <ArticlePage article={article} />;
}
