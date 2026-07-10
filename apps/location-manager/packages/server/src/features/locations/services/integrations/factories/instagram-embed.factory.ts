import type { InstagramEmbed } from "../../../models/location";

export function normalizeInstagramPost(value: string): { url: string; identity: string } {
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/^\/(p|reel|tv)\/([^/]+)/i);
    if (match) {
      const kind = match[1]!.toLowerCase();
      const shortcode = match[2]!;
      return {
        url: `https://www.instagram.com/${kind}/${shortcode}/`,
        identity: `${kind}:${shortcode}`,
      };
    }
    const path = parsed.pathname.replace(/\/+$/, "");
    return { url: `https://www.instagram.com${path}/`, identity: `url:${path.toLowerCase()}` };
  } catch {
    const url = `${value.split(/[?#]/, 1)[0]!.replace(/\/+$/, "")}/`;
    return { url, identity: `url:${url.toLowerCase()}` };
  }
}

export function extractInstagramData(html: string): { url: string | null; author: string | null; identity: string | null } {
  const permalinkMatch = html.match(/data-instgrm-permalink="([^"]+)"/);
  let url = permalinkMatch?.[1] ?? null;
  let identity: string | null = null;
  if (url) {
    const normalized = normalizeInstagramPost(url);
    url = normalized.url;
    identity = normalized.identity;
  }

  const authorMatch = html.match(/A post shared by ([^<]+)/);
  const author = typeof authorMatch?.[1] === "string" ? authorMatch[1].trim() : null;
  return { url, author, identity };
}

export function normalizeInstagram(author: string | null): string | null {
  if (!author) return null;
  let handle = author.replace(/A post shared by/gi, "").trim();
  handle = handle.split(/\s+/)[0]!;
  handle = handle.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "");
  return handle ? `https://www.instagram.com/${handle}/` : null;
}

export function createFromInstagram(embedHtml: string, locationId: number): InstagramEmbed {
  const { author, url, identity } = extractInstagramData(embedHtml);
  let username = "Unknown";

  if (author) {
    const usernameMatch = author.match(/@([a-zA-Z0-9._]+)/);
    if (usernameMatch?.[1]) {
      username = `@${usernameMatch[1]}`;
    } else {
      const cleaned = author.trim().split(/\s+/)[0]!.replace(/[^a-zA-Z0-9._]/g, "");
      if (cleaned) username = `@${cleaned}`;
    }
  }

  return {
    location_id: locationId,
    username,
    url: url || "",
    post_identity: identity || `url:${url || ""}`,
    embed_code: embedHtml,
    images: [],
    original_image_urls: [],
  };
}
