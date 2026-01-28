import { initDb } from "../shared/db/client";
import { app } from "../shared/http/server";
import "../features/locations/routes/location.routes";

export function startServer(port = Number(process.env.PORT || 4317)) {
  initDb();

  // Routes are now defined directly in the app via imports
  // No need to collect routes separately

  console.log(`\nServer running at http://localhost:${port}`);
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.log("⚠️  GOOGLE_MAPS_API_KEY is not set. Geocoding will be skipped.");
  }
  console.log("Press Ctrl+C to stop the server.");

  // Use Bun's serve with Hono app
  return Bun.serve({
    port,
    fetch: app.fetch,
  });
}

if (import.meta.main) {
  startServer();
}
