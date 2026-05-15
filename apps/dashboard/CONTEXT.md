# Context: Dashboard

## Scope

Terminal CLI + HTTP service for monitoring the meta-monorepo's dev services. Reads health, port status, service metadata across every other context. **Passive observer** — owns no business data and does not launch any service.

## Out of Scope

- Running any project — turbo/pnpm/nx commands are launched outside the dashboard process.
- Business data of any kind.
- Configuration that downstream apps would consume.

## Purpose

When several services run in parallel (Questura client + server, Location Manager client/server/python, AI Blog Writer client/server/converter), operators need a single screen showing what's up. The Dashboard renders that view in the terminal (Ink + React) and also exposes the same metadata over HTTP (Hono) for ad-hoc tooling.

## Tech Stack

- Bun runtime.
- TypeScript.
- Hono (HTTP server).
- Ink (React-based terminal UI) + React 19.
- ink-big-text, ink-gradient, ink-spinner.

## Glossary

### `ServiceConfig`

Service shape: `url`, `healthPath`, `port`, `type`, `slowStartup`.

### `type`

`"python" | "bun" | "node" | "vite" | "next" | "payload"`.

### `ServiceStatus`

`"online" | "offline" | "checking" | "starting"`.

### `ProjectConfig`

One row in the dashboard: `name`, `description`, `path`, optional `client`, optional `server`, `commands`.

### `ProjectCommands`

Per-project commands: `dev`, `devClean`, `build?`, `lint?`, `test?`, plus custom entries.

### `GlobalCommand`

Top-level command: `cmd`, `description`, `category` (`"turbo" | "docker" | "utility"`).

### `PROJECTS`

Static list of `ProjectConfig` in `src/cli/dashboard/config/projects.ts`.

### `GLOBAL_COMMANDS`

Static list of `GlobalCommand`.

### `ContextFile`

Reference to a `CONTEXT.md` file in the repo, surfaced by the `c` keyboard view.

### Breakpoint (`BP`, `BP_H`)

Terminal-width / height tiers (S, M, L, XL) that gate which UI features render. Smallest-first: each tier adds, never removes.

## Routes (HTTP service)

- `GET /` — service metadata.
- `GET /projects` — project list.
- `GET /health`, `/health/ready`, `/health/live`.
- `GET /commands` — global commands.

## Relationships

- A **`ProjectConfig`** may have `client`, `server`, or both. Each is a **`ServiceConfig`**.
- The terminal UI polls each `ServiceConfig.url + healthPath` and stores results as a **`ServiceStatus`**.
- The **`ContextFile`** list is hand-maintained and mirrors the repo's actual CONTEXT.md inventory.

## Domain Rules

- Health checks fire every `HEALTH_CHECK_INTERVAL` (30 s) with a `HEALTH_CHECK_TIMEOUT` (2 s).
- A service flagged `slowStartup: true` does not immediately count as offline during boot (used for python-alt-text and its BLIP model warm-load).
- The TUI is reactive to terminal size: below `BP.S` (60 cols) it bails out to an ultra-condensed view.
- The dashboard process never runs the services it observes.

## Naming Conventions

- One config concern per file under `src/cli/dashboard/config/` (`projects.ts`, `constants.ts`, `contextFiles.ts`).
- Components live under `src/cli/dashboard/components/`.
- Hooks under `src/cli/dashboard/hooks/`.

## Decisions

- **Ink + React** for the terminal UI — the team is React-first; this is the lowest-friction choice.
- **Hono** for HTTP — Bun-native, matches Location Manager's server.
- **Static `PROJECTS` config** rather than discovery — explicit ports/paths are easier to debug.
- **No autostart** of services — the dashboard is observation-only by policy.

## AI Guidance

- **Inspect first:** `src/cli/dashboard/config/projects.ts` (the canonical service inventory), then `Dashboard.tsx`, then hooks.
- **Preserve verbatim:** `ProjectConfig`, `ServiceConfig`, `ServiceStatus`, `GlobalCommand`, `PROJECTS`, `GLOBAL_COMMANDS`, `BP`, `BP_H`, `HEALTH_CHECK_INTERVAL`, `HEALTH_CHECK_TIMEOUT`.
- **Do not** add anything that launches a service from inside the dashboard. Observation only.
- **Do not** introduce sibling-package imports — the dashboard must remain free of business code.
- **Do** keep `CONTEXT_FILES` in `src/cli/dashboard/config/contextFiles.ts` in sync with the repo's actual `CONTEXT.md` files. When a new CONTEXT.md is added or removed, update that list.

## Open Questions

- `PROJECTS` duplicates port + path knowledge from each sub-monorepo. Should this be derived from a single source (workspace metadata, env, or each project's own `dashboard.json`)?
- The `c` view for browsing CONTEXT.md files relies on a hardcoded list — should this be glob-discovered at runtime?
