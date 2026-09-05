import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

/**
 * The web UI's build.
 *
 * `root` is the web folder so the Bun server's source sits outside the client
 * bundle, and `/api`, `/projects` and `/health` are proxied to the Hono server
 * on 4500 -- the UI talks to the same routes in development and production.
 */
const API_TARGET = process.env.DASHBOARD_API_URL ?? "http://localhost:4500";

export default defineConfig(({ command }) => ({
  // Built assets are served under /app by the Hono server, so their URLs have
  // to carry that prefix. The dev server has no such prefix and stays at /.
  base: command === "build" ? "/app/" : "/",
  root: "src/web",
  plugins: [react(), tailwind()],
  server: {
    port: 3500,
    strictPort: true,
    proxy: Object.fromEntries(
      ["/api", "/projects", "/health", "/commands"].map((path) => [
        path,
        { target: API_TARGET, changeOrigin: true },
      ]),
    ),
  },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
}));
