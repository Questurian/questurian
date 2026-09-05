import { initDb } from "../shared/db/client";
import { installUsageReporting } from "../shared/usage/reported-fetch";
import { app } from "../shared/http/server";
import "../features/locations/routes/location.routes";
import "../features/scrape/routes/scrape.routes";
import { ServiceContainer } from "../features/locations/container/service-container";

export function startServer(port = Number(process.env.PORT || 4317)) {
  // Before anything else makes a call. Wrapping `fetch` once here is what
  // keeps the eleven external clients from each having to remember to report
  // themselves -- which is how the other app ended up reporting five call
  // paths out of thirty-nine.
  installUsageReporting();
  initDb();
  void ServiceContainer.getInstance().content.instagram.backfillExistingMedia();

  // Routes are now defined directly in the app via imports
  // No need to collect routes separately

  console.log(`\nServer running at http://localhost:${port}`);
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.log("⚠️  GOOGLE_MAPS_API_KEY is not set. Geocoding will be skipped.");
  }
  console.log("Press Ctrl+C to stop the server.");

  // Use Bun's serve with Hono app. maxRequestBodySize bumped to 512MB so the
  // Add-flow photo import multipart (1 source + 7 variants per photo, dozens
  // of photos per Location) doesn't trip Bun's default body limit and EPIPE
  // through the Vite proxy.
  return Bun.serve({
    port,
    fetch: app.fetch,
    maxRequestBodySize: 512 * 1024 * 1024,
  });
}

if (import.meta.main) {
  startServer();
}
