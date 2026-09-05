#!/usr/bin/env bun
/**
 * The dashboard's dev process: the Hono API on 4500 and Vite on 3500.
 *
 * This is what `turbo run dev` runs, which means it is also what the
 * monorepo's root `pnpm dev` runs. Everything in this repo comes up together
 * during development, so the web UI has to come up with it -- being reachable
 * only through a second, separate command is how a surface gets forgotten.
 *
 * They are two processes because Vite owns HMR for the client and Bun owns the
 * watch/restart for the server. Running them from one parent keeps the output
 * in one place and makes Ctrl-C kill both: an orphaned server holding 4500 is
 * the failure this script exists to prevent.
 *
 * The terminal UI is off here. Two processes redrawing one console makes Ink
 * paint over Vite's output, and inside a turbo pane nobody is pressing keys at
 * an Ink UI anyway -- they are looking at the browser. `pnpm dashboard` still
 * gives the terminal view on its own.
 */
import { spawn, type ChildProcess } from "node:child_process";

const API_PORT = process.env.PORT ?? "4500";
const UI_PORT = "3500";

const api = spawn("bun", ["run", "--watch", "src/index.ts"], {
  stdio: "inherit",
  env: { ...process.env, DASHBOARD_TUI: "0" },
});

const ui = spawn("vite", [], { stdio: "inherit", env: process.env });

let shuttingDown = false;

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [api, ui] as ChildProcess[]) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  process.exit(code);
}

// Asymmetric on purpose. The API is the collector other apps report to, so it
// outliving a dead Vite is the right outcome -- a taken port 3500 must not
// take down the thing receiving events. The reverse is not true: a UI with no
// API behind it shows nothing but errors.
api.on("exit", (code) => shutdown(code ?? 0));
ui.on("exit", (code) => {
  if (shuttingDown) return;
  console.error(
    `[dev:web] Vite exited (code ${code ?? 0}). The API on ${API_PORT} is still up; ` +
      `port ${UI_PORT} is probably already in use. Free it and re-run.`,
  );
});

for (const child of [api, ui]) {
  child.on("error", (error) => {
    console.error("[dev:web] failed to start:", error.message);
    shutdown(1);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => shutdown(0));
}

console.log(`[dev:web] API http://localhost:${API_PORT}  ·  UI http://localhost:${UI_PORT}`);
