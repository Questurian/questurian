import { chromium } from "patchright";
import type { Browser, BrowserContext } from "patchright";

/**
 * Generic rendered-HTML fetcher: stealth Chromium (patchright), optionally
 * routed through IPRoyal residential sticky-session proxies. Generalized
 * from tour-import/providers/viator-session.ts, minus the Viator-specific
 * warmup. Consumed by ai-blog-writer's url2blog tier-3 fetch fallback.
 *
 * Without IPROYAL_* env vars the browser runs unproxied — still useful,
 * since JS rendering alone fixes SPA article pages.
 */

type ProxyConfig = {
  server: string;
  username: string;
  password: string;
  sessionId: string;
};

type Session = {
  browser: Browser;
  context: BrowserContext;
  proxy: ProxyConfig | null;
  createdAt: number;
  pageCount: number;
};

const PAGE_LIMIT = 50;
const AGE_LIMIT_MS = 25 * 60 * 1000;
const STICKY_LIFETIME_MIN = 30;
const NAV_TIMEOUT_MS = 30_000;
const POST_NAV_SETTLE_MS = 2500;

const CHALLENGE_TEXT_MAX_CHARS = 2000;
const CHALLENGE_MARKERS = [
  "just a moment",
  "please enable js",
  "enable javascript",
  "verify you are human",
  "are you a robot",
  "access denied",
  "attention required",
];

let current: Session | null = null;
let inFlight: Promise<Session> | null = null;

export class RenderedFetchBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`Rendered fetch blocked: ${reason}`);
    this.name = "RenderedFetchBlockedError";
  }
}

function newSessionId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function buildProxy(sessionId: string): ProxyConfig | null {
  const host = Bun.env.IPROYAL_HOST;
  const port = Bun.env.IPROYAL_PORT;
  const user = Bun.env.IPROYAL_USER;
  const pass = Bun.env.IPROYAL_PASS;
  if (!host || !port || !user || !pass) return null;
  const country = Bun.env.PROXY_COUNTRY ?? "us";
  return {
    server: `http://${host}:${port}`,
    username: user,
    password: `${pass}_country-${country}_session-${sessionId}_lifetime-${STICKY_LIFETIME_MIN}m`,
    sessionId,
  };
}

async function closeSession(session: Session): Promise<void> {
  try {
    await session.context.close();
  } catch {}
  try {
    await session.browser.close();
  } catch {}
}

function isExpired(session: Session): boolean {
  return session.pageCount >= PAGE_LIMIT || Date.now() - session.createdAt >= AGE_LIMIT_MS;
}

async function createSession(): Promise<Session> {
  const proxy = buildProxy(newSessionId());
  const headless = Bun.env.RENDERED_FETCH_HEADLESS !== "false";
  console.log(
    `[scrape:rendered-fetch] starting session ${proxy?.sessionId ?? "no-proxy"} (headless=${headless})`,
  );
  const browser = await chromium.launch({
    headless,
    ...(proxy
      ? {
          proxy: {
            server: proxy.server,
            username: proxy.username,
            password: proxy.password,
          },
        }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  return { browser, context, proxy, createdAt: Date.now(), pageCount: 0 };
}

async function getSession(): Promise<Session> {
  if (current && !isExpired(current)) return current;
  if (current && isExpired(current)) {
    await closeSession(current);
    current = null;
  }
  if (inFlight) return inFlight;
  inFlight = createSession()
    .then((session) => {
      current = session;
      return session;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function markBlocked(session: Session): Promise<void> {
  if (current === session) {
    current = null;
    await closeSession(session);
  }
}

function challengeMarker(innerText: string): string | null {
  if (innerText.length > CHALLENGE_TEXT_MAX_CHARS) return null;
  const lowered = innerText.toLowerCase();
  for (const marker of CHALLENGE_MARKERS) {
    if (lowered.includes(marker)) return marker;
  }
  return null;
}

type AttemptResult = { html: string; status: number } | { blocked: string };

async function attempt(url: string): Promise<AttemptResult> {
  const session = await getSession();
  const page = await session.context.newPage();
  let topStatus: number | null = null;
  page.on("response", (response) => {
    if (topStatus === null && response.url() === url) topStatus = response.status();
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(POST_NAV_SETTLE_MS);
    const html = await page.content();
    const innerText = (await page.textContent("body").catch(() => "")) ?? "";
    session.pageCount += 1;

    if (topStatus !== null && topStatus >= 400 && topStatus !== 404) {
      await markBlocked(session);
      return { blocked: `HTTP ${topStatus}` };
    }
    const marker = challengeMarker(innerText);
    if (marker) {
      await markBlocked(session);
      return { blocked: `challenge page (matched "${marker}")` };
    }
    return { html, status: topStatus ?? 200 };
  } finally {
    await page.close();
  }
}

export async function fetchRenderedHtml(url: string): Promise<{ html: string; status: number }> {
  const first = await attempt(url);
  if ("html" in first) return first;

  console.log(`[scrape:rendered-fetch] blocked (${first.blocked}); retrying with fresh session`);
  const second = await attempt(url);
  if ("html" in second) return second;

  throw new RenderedFetchBlockedError(`${first.blocked}, then ${second.blocked}`);
}
