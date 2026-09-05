/**
 * Whether the apps are actually reading the table this dashboard serves.
 *
 * Serving a table and having it read are different facts, and for an entire
 * rollout only the first was visible here. Location Manager was wired to this
 * dashboard; ai-blog-writer was not. The Models tab showed 39 of its jobs,
 * saved changes to them, and changed nothing -- that backend went on reading
 * the models compiled into it, and nothing on this screen could have said so.
 *
 * So each app answers `GET /model-gateway/status` with what it is really
 * doing, and the Models tab shows it. This is the check that would have caught
 * that bug on day one.
 */

export interface ListenerStatus {
  app: string;
  /** Where the app is, so a reader can go and look when it says nothing. */
  url: string;
  reachable: boolean;
  /** "dashboard" when it has read this table; "defaults" when it has not. */
  tableSource?: string;
  settingsUrl?: string | null;
  failedFetches?: number;
  /** Jobs an environment variable is holding. These ignore this dashboard. */
  pinnedJobs?: Record<string, string>;
  jobs?: string[];
  detail?: string;
}

/** Where each app lives locally. Everything in this repo runs on one machine. */
const KNOWN_APPS: ReadonlyArray<{ app: string; base: string; env: string }> = [
  {
    app: "ai-blog-writer",
    base: "http://localhost:4003",
    env: "ABW_BASE_URL",
  },
  {
    app: "location-manager",
    base: "http://localhost:8642",
    env: "ALT_TEXT_API_URL",
  },
];

const TIMEOUT_MS = 1500;

async function ask(app: string, base: string): Promise<ListenerStatus> {
  const url = `${base}/model-gateway/status`;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return { app, url, reachable: false, detail: `HTTP ${response.status}` };
    }
    const body = (await response.json()) as Omit<ListenerStatus, "app" | "url" | "reachable">;
    return { ...body, app, url, reachable: true };
  } catch (error) {
    // An app that is simply not running is the normal case, not an error. The
    // screen says "not running" rather than showing a failure.
    return {
      app,
      url,
      reachable: false,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }
}

export function listenerStatuses(): Promise<ListenerStatus[]> {
  return Promise.all(
    KNOWN_APPS.map(({ app, base, env }) =>
      ask(app, process.env[env]?.trim() || base),
    ),
  );
}
