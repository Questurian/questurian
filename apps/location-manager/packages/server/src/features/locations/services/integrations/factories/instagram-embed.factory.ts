import type { InstagramEmbed } from "../../../models/location";

export function extractInstagramData(html: string): { url: string | null; author: string | null } {
  const permalinkMatch = html.match(/data-instgrm-permalink="([^"]+)"/);
  let url = permalinkMatch?.[1] ?? null;
  if (url) {
    try {
      const parsed = new URL(url);
      url = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}/`;
    } catch {
      url = `${url.split(/[?#]/, 1)[0]!.replace(/\/+$/, "")}/`;
    }
  }

  const authorMatch = html.match(/A post shared by ([^<]+)/);
  const author = typeof authorMatch?.[1] === "string" ? authorMatch[1].trim() : null;
  return { url, author };
}

export function normalizeInstagram(author: string | null): string | null {
  if (!author) return null;
  let handle = author.replace(/A post shared by/gi, "").trim();
  handle = handle.split(/\s+/)[0]!;
  handle = handle.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "");
  return handle ? `https://www.instagram.com/${handle}/` : null;
}

export function createFromInstagram(embedHtml: string, locationId: number): InstagramEmbed {
  const { author, url } = extractInstagramData(embedHtml);
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
    embed_code: embedHtml,
    images: [],
    original_image_urls: [],
  };
}
