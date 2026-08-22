import type { ArticleScope, ArticleTypeKey } from "@/features/articles/lib/articleScope";

export const PUBLIC_CONTENT_REVALIDATE_SECONDS = 60 * 60;

type PublicFetchOptions = RequestInit & {
  next: {
    revalidate: number;
    tags: string[];
  };
};

function tagPart(value: string | number | null | undefined): string {
  return encodeURIComponent(String(value ?? "none").trim().toLowerCase());
}

function scopeTag(scope: ArticleScope): string {
  if (scope.kind === "city") {
    return `city:${tagPart(scope.country)}:${tagPart(scope.city)}`;
  }

  if (scope.kind === "country") {
    return `country:${tagPart(scope.country)}`;
  }

  return "global";
}

export function publicFetchOptions(tags: string[]): PublicFetchOptions {
  return {
    next: {
      revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
      tags,
    },
  };
}

export const publicCacheTags = {
  sitemap: () => "sitemap",
  countryCities: (country: string) => `country-cities:${tagPart(country)}`,
  locationHomepage: (country: string, city: string, neighborhood?: string) =>
    `location-homepage:${tagPart(country)}:${tagPart(city)}${neighborhood ? `:${tagPart(neighborhood)}` : ''}`,
  article: (scope: ArticleScope, type: ArticleTypeKey, slug: string, lang: string) =>
    `article:${scopeTag(scope)}:${tagPart(type)}:${tagPart(slug)}:${tagPart(lang)}`,
  articlePath: (path: string, lang: string) => `article-path:${tagPart(path)}:${tagPart(lang)}`,
  articleRedirect: (path: string) => `article-redirect:${tagPart(path)}`,
  articleIndex: (
    scope: ArticleScope,
    type: ArticleTypeKey,
    page: number,
    lang: string,
  ) => `article-index:${scopeTag(scope)}:${tagPart(type)}:${tagPart(page)}:${tagPart(lang)}`,
  articleIndexScope: (scope: ArticleScope, type: ArticleTypeKey, lang: string) =>
    `article-index:${scopeTag(scope)}:${tagPart(type)}:${tagPart(lang)}`,
  relatedMapsArticles: (country: string, city: string | null, currentSlug: string) =>
    `related-maps:${tagPart(country)}:${tagPart(city)}:${tagPart(currentSlug)}`,
  relatedMapsScope: (country: string, city: string | null) =>
    `related-maps:${tagPart(country)}:${tagPart(city)}`,
};
