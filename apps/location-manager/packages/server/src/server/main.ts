import { initDb } from "../shared/db/client";
import { app } from "../shared/http/server";
import "../features/locations/routes/location.routes";
import "../features/scrape/routes/scrape.routes";

export function startServer(port = Number(process.env.PORT || 4317)) {
  initDb();

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
