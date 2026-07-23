import { chromium } from "patchright";
import type { Browser, BrowserContext } from "patchright";

type ProxyConfig = {
  server: string;
  username: string;
  password: string;
  sessionId: string;
};

type Session = {
  browser: Browser;
  context: BrowserContext;
  proxy: ProxyConfig;
  createdAt: number;
  pageCount: number;
};

const PAGE_LIMIT = 50;
const AGE_LIMIT_MS = 25 * 60 * 1000;
const STICKY_LIFETIME_MIN = 30;
const NAV_TIMEOUT_MS = 30_000;
const POST_NAV_SETTLE_MS = 2500;

let current: Session | null = null;
let inFlight: Promise<Session> | null = null;

class ViatorBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`Viator blocked scrape: ${reason}`);
    this.name = "ViatorBlockedError";
  }
}

function requireEnv(name: string): string {
  const value = Bun.env[name];
  if (!value) throw new Error(`missing env var: ${name}`);
  return value;
}

function newSessionId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function buildProxy(sessionId: string): ProxyConfig {
  const host = requireEnv("IPROYAL_HOST");
  const port = requireEnv("IPROYAL_PORT");
  const user = requireEnv("IPROYAL_USER");
  const pass = requireEnv("IPROYAL_PASS");
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

async function createAndWarm(): Promise<Session> {
  const proxy = buildProxy(newSessionId());
  console.log(`[tour-import:viator] starting session ${proxy.sessionId}`);
  const browser = await chromium.launch({
    headless: false,
    proxy: {
      server: proxy.server,
      username: proxy.username,
      password: proxy.password,
    },
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });

  const page = await context.newPage();
  try {
    const response = await page.goto("https://www.viator.com/", {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    await page.waitForTimeout(6000);
    const status = response?.status() ?? 0;
    const body = (await page.textContent("body").catch(() => "")) ?? "";
    if (status >= 400 || /please enable js/i.test(body)) {
      await browser.close();
      throw new ViatorBlockedError(`warmup blocked: status=${status} bytes=${body.length}`);
    }
    console.log(`[tour-import:viator] session ${proxy.sessionId} warmed`);
  } finally {
    await page.close();
  }

  return { browser, context, proxy, createdAt: Date.now(), pageCount: 0 };
}

async function getSession(): Promise<Session> {
  if (current && !isExpired(current)) return current;
  if (current && isExpired(current)) {
    await closeSession(current);
    current = null;
  }
  if (inFlight) return inFlight;
  inFlight = createAndWarm()
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

async function attempt(url: string): Promise<string | { blocked: string }> {
  const session = await getSession();
  const page = await session.context.newPage();
  let topStatus: number | null = null;
  page.on("response", (response) => {
    if (topStatus === null && response.url() === url) topStatus = response.status();
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(POST_NAV_SETTLE_MS);
    const body = await page.content();
    const innerText = (await page.textContent("body").catch(() => "")) ?? "";
    session.pageCount += 1;

    if (topStatus !== null && topStatus >= 400 && topStatus !== 404) {
      await markBlocked(session);
      return { blocked: `HTTP ${topStatus}` };
    }
    if (/please enable js/i.test(innerText)) {
      await markBlocked(session);
      return { blocked: "datadome challenge" };
    }
    return body;
  } finally {
    await page.close();
  }
}

export async function fetchViatorRenderedHtml(url: string): Promise<string> {
  const first = await attempt(url);
  if (typeof first === "string") return first;

  console.log(`[tour-import:viator] blocked (${first.blocked}); retrying with fresh session`);
  const second = await attempt(url);
  if (typeof second === "string") return second;

  throw new ViatorBlockedError(`${first.blocked}, then ${second.blocked}`);
}
