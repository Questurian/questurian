import type { Context } from "hono";
import { app } from "@server/shared/http/server";
import { successResponse } from "@shared/types/api-response";
import { BadRequestError } from "@shared/errors/http-error";
import { fetchRenderedHtml } from "../services/rendered-fetch.service";

/**
 * POST /api/scrape/rendered-fetch  { url }
 * Returns fully rendered HTML via stealth Chromium (+ residential proxy
 * when IPROYAL_* env vars are set). Tier-3 fallback for ai-blog-writer's
 * url2blog article fetch.
 */
async function postRenderedFetch(c: Context) {
  const body = await c.req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new BadRequestError("url must start with http:// or https://");
  }

  const { html, status } = await fetchRenderedHtml(url);
  return c.json(successResponse({ url, html, status }));
}

app.post("/api/scrape/rendered-fetch", postRenderedFetch);
