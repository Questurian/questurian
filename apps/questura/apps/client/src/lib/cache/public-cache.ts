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

/**
 * The headers every server-side call from this frontend to the backend sends.
 * Server-only: neither variable is `NEXT_PUBLIC_`, so a browser bundle sees
 * `undefined` and sends nothing.
 *
 * - `x-questura-render-token` gives the site's reads their own bounded
 *   rate-limit bucket instead of the shared per-IP one every reader's render
 *   would otherwise land in (server: shared/http/public-read-rate-limit.ts).
 * - `x-questura-origin-auth` is the front door's key (server:
 *   shared/http/origin-auth.ts, ADR-0016). Cloudflare's Transform Rule adds it
 *   to requests it forwards to the API, but whether that rule applies to this
 *   Worker's own subrequests is something only the platform can answer
 *   (launch fix plan PL1). Sending it from a Worker secret makes the answer
 *   not matter: without it, with the lock on, every page that needs the API
 *   would fail to render.
 */
export const RENDER_TOKEN_HEADER = "x-questura-render-token";
export const ORIGIN_AUTH_HEADER = "x-questura-origin-auth";

export function renderHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = process.env.QUESTURA_RENDER_TOKEN?.trim();
  if (token) headers[RENDER_TOKEN_HEADER] = token;
  const originSecret = process.env.ORIGIN_AUTH_SECRET?.trim();
  if (originSecret) headers[ORIGIN_AUTH_HEADER] = originSecret;
  return headers;
}

export function publicFetchOptions(tags: string[]): PublicFetchOptions {
  return {
    headers: renderHeaders(),
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
