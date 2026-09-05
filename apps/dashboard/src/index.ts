import { Hono } from "hono";
import { cors } from "hono/cors";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderInkDashboard } from "./cli/dashboard";

import projects from "./routes/projects";
import health from "./routes/health";
import commands from "./routes/commands";
import usage from "./routes/usage";
import { startRetentionSweep } from "./usage/retention";
import { getUsageStore, usageDatabasePath } from "./usage/store";

const app = new Hono();

// Note: logger disabled to avoid interfering with Ink CLI output
app.use("*", cors());

app.get("/", (c) => {
  return c.json({
    name: "Questurian Dashboard",
    version: "0.0.1",
    endpoints: {
      projects: "/projects",
      health: "/health",
      commands: "/commands",
      usage: "/api/usage/v1",
      web: "/app",
    },
  });
});

app.route("/projects", projects);
app.route("/health", health);
app.route("/commands", commands);
app.route("/api/usage", usage);

// The built web UI, when there is one. In development Vite serves it on its
// own port and proxies /api here, so this path only matters after a build.
const WEB_DIST = join(import.meta.dir, "..", "dist", "web");
if (existsSync(WEB_DIST)) {
  app.get("/app/*", serveWebAsset);
  app.get("/app", serveWebAsset);
}

// Content types are declared rather than sniffed. A `Response` built from a
// `Bun.file` loses its type by the time Hono has finished with it, and a
// module script served without one is refused by the browser outright -- a
// blank page whose only clue is a MIME error in the console.
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  return (dot === -1 ? undefined : CONTENT_TYPES[path.slice(dot).toLowerCase()])
    ?? "application/octet-stream";
}

async function serveWebAsset(c: { req: { path: string } }): Promise<Response> {
  const requested = c.req.path.replace(/^\/app\/?/, "") || "index.html";
  // Refuse to walk out of the bundle even though the URL parser normalises
  // most of these away: serving arbitrary files is not worth trusting a layer
  // to keep doing that.
  const relative = requested.includes("..") ? "index.html" : requested;

  const file = Bun.file(join(WEB_DIST, relative));
  if (await file.exists()) {
    return new Response(file, { headers: { "content-type": contentTypeFor(relative) } });
  }

  // Unknown paths fall back to the shell: the tabs are client-side state, so a
  // reload on /app/usage must not 404.
  return new Response(Bun.file(join(WEB_DIST, "index.html")), {
    headers: { "content-type": CONTENT_TYPES[".html"]! },
  });
}

const port = process.env.PORT || 4500;

// Opening the store here rather than on the first request means a broken
// database path is a boot failure with a stack, not a mystery 500 later.
const usageStore = getUsageStore();
startRetentionSweep(usageStore, (removed) => {
  console.log(`[usage] purged ${removed} expired event(s)`);
});

// The terminal UI is the default face of this app; `DASHBOARD_TUI=0` turns it
// off for the web workflow, where two processes share one console.
if (process.env.DASHBOARD_TUI !== "0") {
  setTimeout(() => {
    renderInkDashboard();
  }, 1000);
} else {
  console.log(`[dashboard] API on http://localhost:${port}`);
  console.log(`[usage] events in ${usageDatabasePath()} (${usageStore.count()} stored)`);
}

export default {
  port,
  fetch: app.fetch,
};
