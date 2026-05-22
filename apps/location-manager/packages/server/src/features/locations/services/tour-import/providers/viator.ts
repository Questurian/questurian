import { BadRequestError } from "@shared/errors/http-error";
import type { ViatorProduct } from "../types";
import { fetchViatorRenderedHtml } from "./viator-session";

type Json = unknown;

const JSON_LD_RE =
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function safeJson(text: string): Json | null {
  try {
    return JSON.parse(text.replace(/&quot;/g, '"').trim());
  } catch {
    return null;
  }
}

function collectJsonLd(html: string): Json[] {
  const out: Json[] = [];
  const visit = (node: unknown): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    if ("@type" in node) out.push(node);
    Object.values(node as Record<string, unknown>).forEach(visit);
  };

  for (const match of html.matchAll(JSON_LD_RE)) {
    visit(safeJson(match[1] ?? ""));
  }
  return out;
}

function pick(obj: Json, key: string): Json {
  if (!obj || typeof obj !== "object") return null;
  return (obj as Record<string, unknown>)[key] ?? null;
}

function pickString(obj: Json, key: string): string | null {
  const value = pick(obj, key);
  return typeof value === "string" ? value : null;
}

function pickNumber(obj: Json, key: string): number | null {
  const value = pick(obj, key);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function findByType(nodes: Json[], type: string): Json | null {
  for (const node of nodes) {
    const rawType = pick(node, "@type");
    if (rawType === type || (Array.isArray(rawType) && rawType.includes(type))) {
      return node;
    }
  }
  return null;
}

function firstImage(obj: Json): string | null {
  const image = pick(obj, "image");
  if (typeof image === "string") return image;
  if (Array.isArray(image) && typeof image[0] === "string") return image[0];
  if (image && typeof image === "object") return pickString(image, "url");
  return null;
}

function extractText(html: string, pattern: RegExp): string | null {
  const match = html.replace(/\s+/g, " ").match(pattern);
  return match?.[1]?.trim() || null;
}

function extractProductCode(rawUrl: string): string | null {
  const match = rawUrl.match(/\/d\d+-([A-Za-z0-9]+)(?:[/?#]|$)/);
  return match?.[1] ?? null;
}

async function fetchViatorHtml(url: string): Promise<string> {
  try {
    return await fetchViatorRenderedHtml(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Viator scrape error";
    throw new BadRequestError("Viator scrape failed", {
      code: message.includes("missing env var")
        ? "VIATOR_PROXY_NOT_CONFIGURED"
        : "VIATOR_SCRAPE_FAILED",
      cause: message,
      url,
    });
  }
}

export async function scrapeViatorProduct(url: string): Promise<ViatorProduct> {
  const html = await fetchViatorHtml(url);
  const nodes = collectJsonLd(html);
  const product = findByType(nodes, "Product") ?? findByType(nodes, "TouristAttraction") ?? {};
  const offers = pick(product, "offers");
  const rating = pick(product, "aggregateRating");

  const sourceTitle = pickString(product, "name");
  if (!sourceTitle) {
    throw new BadRequestError("Viator product data was not found on this page", {
      code: "VIATOR_PRODUCT_NOT_FOUND",
      url,
    });
  }

  return {
    provider: "viator",
    url,
    productCode: extractProductCode(url),
    sourceTitle,
    description: pickString(product, "description"),
    duration: extractText(html, />(\d{1,3}\s*(?:hours?|hrs?|minutes?|mins?|days?)(?:\s*(?:to|-)\s*\d{1,3}\s*(?:hours?|hrs?|minutes?|mins?|days?))?(?:\s*\d{1,3}\s*(?:minutes?|mins?))?)</i),
    supplier:
      pickString(pick(product, "brand"), "name") ??
      extractText(html, /Supplied by\s+([^<]{1,120})</i),
    imageUrl: firstImage(product),
    priceFrom: pickNumber(offers, "lowPrice") ?? pickNumber(offers, "price"),
    currency: pickString(offers, "priceCurrency"),
    rating: pickNumber(rating, "ratingValue"),
    reviewCount: pickNumber(rating, "reviewCount") ?? pickNumber(rating, "ratingCount"),
  };
}
