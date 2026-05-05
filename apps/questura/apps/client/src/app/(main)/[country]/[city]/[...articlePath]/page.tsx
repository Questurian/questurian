import { createElement } from 'react';
import { notFound } from 'next/navigation';
import { isStandardArticle } from '@/features/articles/lib/articleGuards';
import {
  articleLayoutKeyFromRouteType,
  parseArticlePath,
} from '@/features/articles/lib/articleRoute';
import { fetchArticle } from '@/features/articles/lib/fetchArticle';
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

  const article = await fetchArticle({ country, city, type, slug });

  if (!article) {
    notFound();
  }

  if (layoutKey === 'maps') {
    if (!isMapsListicleArticle(article)) {
      notFound();
    }
    return <MapsArticleLayout article={article} />;
  }

  if (!isStandardArticle(article)) {
    notFound();
  }

  const Layout = getArticleLayoutComponent(layoutKey);
  return createElement(Layout, { article });
}
