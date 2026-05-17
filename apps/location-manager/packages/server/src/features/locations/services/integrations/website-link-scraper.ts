// Best-effort menu / reservation URL extraction from a restaurant's homepage.
// Strategy: fetch the page, scan all <a href="..."> + obvious link-rel + OpenGraph tags
// for (a) external reservation provider domains, (b) anchor text or path containing
// menu / reservation keywords. Single GET, no JS execution, no recursion.

const RESERVATION_PROVIDER_HOSTS = [
  "opentable.com",
  "resy.com",
  "sevenrooms.com",
  "tock.com",
  "exploretock.com",
  "yelp.com/reservations",
  "bookatable.com",
];

const MENU_KEYWORDS = ["menu", "menus", "carta", "cardapio", "speisekarte"];
const RESERVATION_KEYWORDS = [
  "reservation",
  "reservations",
  "reserve",
  "book-a-table",
  "book-table",
  "booking",
  "reservar",
];

const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;
const ANCHOR_PATTERN = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const STRIP_TAGS_PATTERN = /<[^>]+>/g;
const WHITESPACE_PATTERN = /\s+/g;

const FETCH_TIMEOUT_MS = 4000;
const MAX_BODY_BYTES = 750_000;

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (compatible; LocationManagerBot/1.0; +https://questurian.local)";

export interface WebsiteLinks {
  menuUrl: string | null;
  reservationUrl: string | null;
}

interface AnchorMatch {
  href: string;
  text: string;
}

function resolveUrl(href: string, base: URL): string | null {
  try {
    if (ABSOLUTE_URL_PATTERN.test(href)) return new URL(href).toString();
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function containsKeyword(haystack: string, keywords: string[]): boolean {
  const lower = haystack.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function looksLikeReservationProvider(absoluteUrl: string): boolean {
  try {
    const host = new URL(absoluteUrl).hostname.toLowerCase();
    return RESERVATION_PROVIDER_HOSTS.some((provider) => host.endsWith(provider.split("/")[0]!));
  } catch {
    return false;
  }
}

function* iterateAnchors(html: string): Iterable<AnchorMatch> {
  ANCHOR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANCHOR_PATTERN.exec(html))) {
    const href = match[1]?.trim();
    if (!href) continue;
    const rawText = match[2] ?? "";
    const text = rawText.replace(STRIP_TAGS_PATTERN, " ").replace(WHITESPACE_PATTERN, " ").trim();
    yield { href, text };
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html,*/*;q=0.1" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.toLowerCase().includes("text/html")) return null;

    const reader = response.body?.getReader();
    if (!reader) return await response.text();

    const decoder = new TextDecoder("utf-8");
    let total = 0;
    let html = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (total >= MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        break;
      }
    }
    html += decoder.decode();
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function scrapeRestaurantLinks(websiteUrl: string | null | undefined): Promise<WebsiteLinks> {
  const empty: WebsiteLinks = { menuUrl: null, reservationUrl: null };
  if (!websiteUrl) return empty;

  let base: URL;
  try {
    base = new URL(websiteUrl);
  } catch {
    return empty;
  }

  const html = await fetchHtml(base.toString());
  if (!html) return empty;

  let menuUrl: string | null = null;
  let reservationUrl: string | null = null;

  for (const anchor of iterateAnchors(html)) {
    const absolute = resolveUrl(anchor.href, base);
    if (!absolute) continue;

    const haystack = `${anchor.href} ${anchor.text}`;

    if (!reservationUrl) {
      if (looksLikeReservationProvider(absolute)) {
        reservationUrl = absolute;
      } else if (containsKeyword(haystack, RESERVATION_KEYWORDS)) {
        reservationUrl = absolute;
      }
    }

    if (!menuUrl && containsKeyword(haystack, MENU_KEYWORDS)) {
      // Skip the reservation match — same anchor shouldn't double-classify.
      if (absolute !== reservationUrl) {
        menuUrl = absolute;
      }
    }

    if (menuUrl && reservationUrl) break;
  }

  return { menuUrl, reservationUrl };
}
