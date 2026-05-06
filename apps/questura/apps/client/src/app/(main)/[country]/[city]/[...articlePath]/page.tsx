import { createElement } from 'react';
import { notFound } from 'next/navigation';
import { isStandardArticle } from '@/features/articles/lib/articleGuards';
import {
  articleLayoutKeyFromRouteType,
  parseArticlePath,
} from '@/features/articles/lib/articleRoute';
import { fetchArticle } from '@/features/articles/lib/fetchArticle';
import { fetchMapsArticlesList } from '@/features/articles/lib/fetchMapsArticlesList';
import { getArticleLayoutComponent } from '@/features/articles/layouts/articleLayoutRegistry';
import { MapsArticleLayout } from '@/features/articles/layouts/MapsArticleLayout';
import { isMapsListicleArticle } from '@/features/articles/types/mapsListicle';

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
  const layoutKey = articleLayoutKeyFromRouteType(type);

  if (layoutKey === 'maps') {
    const [article, relatedArticles] = await Promise.all([
      fetchArticle({ country, city, type, slug }),
      fetchMapsArticlesList(country, city),
    ]);

    if (!article) notFound();
    if (!isMapsListicleArticle(article)) notFound();

    return (
      <MapsArticleLayout
        article={article}
        relatedArticles={relatedArticles}
        country={country}
        city={city}
      />
    );
  }

  const article = await fetchArticle({ country, city, type, slug });

  if (!article) {
    notFound();
  }

  if (!isStandardArticle(article)) {
    notFound();
  }

  const Layout = getArticleLayoutComponent(layoutKey);
  return createElement(Layout, { article });
}
