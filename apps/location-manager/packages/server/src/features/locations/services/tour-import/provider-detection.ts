import type { TourSourceProvider } from "./types";

const VIATOR_HOST_RE = /(^|\.)viator\.com$/i;

export function normalizeTourImportUrl(rawUrl: string): string {
  const url = new URL(rawUrl.trim());
  url.hash = "";
  url.searchParams.sort();
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

export function detectTourSourceProvider(rawUrl: string): TourSourceProvider | null {
  try {
    const url = new URL(rawUrl.trim());
    return VIATOR_HOST_RE.test(url.hostname) ? "viator" : null;
  } catch {
    return null;
  }
}
