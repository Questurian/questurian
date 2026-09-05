# Context: Dashboard

## Scope

Terminal CLI + web UI + HTTP service for monitoring the meta-monorepo. Two jobs:

1. **Service status** — health, port status and service metadata across every other context.
2. **API usage** — a collector for reports of external API calls made by the other apps, plus the charts and tables that read them.

**Observer, not participant.** It owns no business data and launches nothing. It does now *store* one kind of data: its own observations of other apps' external calls.

## Out of Scope

- Running any project — turbo/pnpm/nx commands are launched outside the dashboard process.
- Business data of any kind.
- Configuration that downstream apps would consume.
- **Proxying, routing or retrying anybody's API calls.** The usage monitor receives reports of calls that already happened. See [docs/adr/0001](./docs/adr/0001-observability-not-gateway.md).
- **Pricing.** It stores the cost a caller reports and never computes one.

## Purpose

When several services run in parallel (Questura client + server, Location Manager client/server/python, AI Blog Writer client/server/converter), operators need a single screen showing what's up. The Dashboard renders that view in the terminal (Ink + React), in a browser, and over HTTP (Hono) for ad-hoc tooling.

The API monitor answers the question no single app could: across the whole repo, what external services did we call, how often, how slowly, how much did they cost, and what share failed. Before it, the only accounting anywhere was Prompt2Blog's per-run token ledger, which is scoped to one pipeline and blind to duration, failures, and every non-LLM call.

## Surfaces

| Command | What comes up |
|---|---|
| `pnpm dev` (repo root) | Everything, this app included: API on 4500 + web UI on 3500 |
| `pnpm dashboard:web` (repo root) | This app only: API 4500 + web UI 3500 |
| `pnpm dashboard` (repo root) | This app only: API 4500 + terminal UI |

The turbo task that root `pnpm dev` runs is **`dev`**, and `dev` is the web one. That is deliberate: everything in this repo comes up together during development, and a surface reachable only through its own second command is a surface that gets forgotten. The terminal view is `dev:tui`.

`DASHBOARD_TUI=0` runs the server without the terminal UI, which is what the web workflow does. The two processes shut down asymmetrically: if Vite dies the API stays up, because the API is the collector other apps report to and a taken port 3500 must not take it down.

## Tech Stack

- Bun runtime.
- TypeScript.
- Hono (HTTP server).
- Ink (React-based terminal UI) + React 19.
- ink-big-text, ink-gradient, ink-spinner.
- `bun:sqlite` (WAL) for the usage store.
- zod for the ingest contract.
- Vite + React 19 + Tailwind v4 + TanStack Query + recharts for the web UI.

## Environment

| Variable | Effect |
|---|---|
| `PORT` | API port (default 4500) |
| `DASHBOARD_TUI` | `0` disables the Ink UI |
| `DASHBOARD_INGEST_KEY` | when set, ingest requires this in `x-usage-key`; when unset, ingest accepts loopback callers only |
| `USAGE_DB_PATH` | event database location (default `data/usage.sqlite`) |
| `USAGE_RETENTION_DAYS` | how long events are kept (default 90; `0` keeps everything) |

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

### `ApiUsageEvent`

One external API call, as reported by the app that made it. Required: `ts` (epoch ms), `service`, `provider`, `status`. Optional: `feature`, `endpoint`, `model`, `durationMs`, `httpStatus`, `errorKind`, `errorMessage`, `tokens`, `costUsd`, `costBasis`, `correlationId`, `metadata`, `eventId`. Defined in `src/usage/contract.ts`; explained in [docs/api-usage-contract.md](./docs/api-usage-contract.md).

### `service` (usage)

Which of **our** apps made the call — `abw-backend`, `lm-server`, `questura-server`. Not to be confused with `ServiceConfig`, which is a dev process this app monitors.

### `provider`

The **external** service that was called — `google-vertex`, `anthropic`, `claude-cli`, `serpapi`, `google-places`, `stripe`, `bunny-cdn`.

### `feature`

What the caller was doing when it made the call — `prompt2blog`, `listicle`, `place-details`, `payments`. The producing app owns this vocabulary; the collector never validates it.

### `costBasis`

How a cost figure was arrived at: `measured` (the provider reported this price for this call) or `rate-table` (the caller computed it from a rate table it owns). Absent means no price. Deliberately the same two words Prompt2Blog's `pricing.py` uses.

### Unpriced call

A call that reported tokens but no `costUsd`. Counted and displayed separately, never folded into a cost total as zero.

### `correlationId`

Ties several calls to one unit of work — a Prompt2Blog `run_id`, a location id. Opaque to the collector.

### `UsageStore`

The storage interface the routes see (`ingest`, `summary`, `series`, `breakdown`, `events`, `facets`, `purgeOlderThan`). `SqliteUsageStore` is the only implementation.

### `GroupableDimension`

`"provider" | "service" | "feature" | "model"` — the dimensions a read may group by. Anything else is a 400.

### `SeriesBucket` / `SeriesMetric`

`"minute" | "hour" | "day"` and `"calls" | "cost" | "tokens" | "errors"`.

## Routes (HTTP service)

- `GET /` — service metadata.
- `GET /projects` — project list, ports, health-check interval.
- `GET /projects/health` — live status for every project.
- `GET /projects/commands` — global commands.
- `GET /projects/:name`, `GET /projects/:name/status`.
- `GET /health`, `/health/ready`, `/health/live`.
- `GET /commands` — global commands (legacy placeholder route).
- `GET /api/usage/v1` — schema version, batch cap, vocabularies.
- `POST /api/usage/v1/events` — ingest a batch (max 500), replies 202.
- `GET /api/usage/v1/summary|series|breakdown|events|facets` — reads.
- `GET /app/*` — the built web UI, when `dist/web` exists.

## Relationships

- A **`ProjectConfig`** may have `client`, `server`, or both. Each is a **`ServiceConfig`**.
- Both UIs get a **`ServiceStatus`** from `utils/serviceStatus.ts`. The terminal UI calls it directly through `useHealthCheck`; the web UI asks the server for it via `GET /projects/health`. One rule, two faces.
- The **`ContextFile`** list is hand-maintained and mirrors the repo's actual CONTEXT.md inventory.
- Other apps **push** `ApiUsageEvent`s here. This is the only inbound dependency the Dashboard has ever had, and it is one-way: no app reads anything back, and none of them care whether the collector is up.
- **AI Blog Writer is the only emitter today** (Prompt2Blog's model calls, via `app/shared/api_usage.py`). Its per-run token ledger stays where it is — the ledger's receipt and the collector's history answer different questions.

## Domain Rules

- Health checks fire every `HEALTH_CHECK_INTERVAL` (30 s) with a `HEALTH_CHECK_TIMEOUT` (2 s).
- A service flagged `slowStartup: true` does not immediately count as offline during boot (used for python-alt-text and its BLIP model warm-load).
- The TUI is reactive to terminal size: below `BP.S` (60 cols) it bails out to an ultra-condensed view.
- The dashboard process never runs the services it observes.
- **The collector never computes a cost.** `costUsd` is stored only as reported.
- **Absent is not zero.** A call with no duration is excluded from percentiles rather than counted as fast; a provider with no price shows `—`, not `$0.00`; a series that is zero in every bucket is dropped from a chart rather than drawn flat.
- **Unknown ingest fields are preserved** under `metadata._unknown`, never rejected — an emitter newer than the collector must not lose data.
- **A bad read parameter is a 400.** Silently ignoring `provider=typo` and showing the unfiltered total is worse than saying the word was not understood.
- **A batch is not all-or-nothing.** Valid events land; invalid ones are reported by index. Producers are fire-and-forget, so the collector logs every rejection — that log is the only place a reason is visible.
- **`eventId` is the idempotency key.** A replay is dropped, so an emitter may retry.
- Percentiles are nearest-rank, so p95 names a call that actually happened.

## Naming Conventions

- One config concern per file under `src/cli/dashboard/config/` (`projects.ts`, `constants.ts`, `contextFiles.ts`).
- Terminal components live under `src/cli/dashboard/components/`; hooks under `src/cli/dashboard/hooks/`.
- The collector lives under `src/usage/` (`contract.ts`, `types.ts`, `queries.ts`, `store.ts`, `params.ts`, `retention.ts`, `migrations/`).
- The web UI lives under `src/web/`, one folder per tab (`services/`, `usage/`) plus `components/` and `lib/`.
- Wire fields are camelCase; SQL columns are snake_case. The mapping exists only in `src/usage/store.ts`.

## Decisions

- **Ink + React** for the terminal UI — the team is React-first; this is the lowest-friction choice.
- **Hono** for HTTP — Bun-native, matches Location Manager's server.
- **Static `PROJECTS` config** rather than discovery — explicit ports/paths are easier to debug.
- **No autostart** of services — the dashboard is observation-only by policy.
- **The terminal UI stays.** The web UI is added alongside it, not in place of it.
- **`bun:sqlite`, one file, no rollup tables.** Matches lm-server, needs no infrastructure, instant at a few thousand events a day. Reads go through `UsageStore` so a later swap is contained. See ADR 0001 for when to revisit.
- **Polling, not websockets.** The web UI refetches every 10 s, which is indistinguishable from live for a human and keeps the server a surface `curl` can drive.
- **Chart animation is off.** The panels refetch every 10 s; animating each arrival means the charts spend a visible share of their life mid-draw.
- **Dark, dense operator styling** — deliberately *not* Questura's warm editorial palette, which belongs to reader-facing pages.
- **Two tsconfigs.** `tsconfig.json` (Bun types, excludes `src/web`) and `tsconfig.web.json` (DOM types). `pnpm lint` runs both.

## AI Guidance

- **Inspect first:** `src/cli/dashboard/config/projects.ts` (the canonical service inventory), then `Dashboard.tsx`, then hooks. For the monitor: `src/usage/contract.ts`, then `store.ts`, then `queries.ts`.
- **Preserve verbatim:** `ProjectConfig`, `ServiceConfig`, `ServiceStatus`, `GlobalCommand`, `PROJECTS`, `GLOBAL_COMMANDS`, `BP`, `BP_H`, `HEALTH_CHECK_INTERVAL`, `HEALTH_CHECK_TIMEOUT`, `ApiUsageEvent` field names, `UsageStore`, `USAGE_SCHEMA_VERSION`, `costBasis` values.
- **Do not** add anything that launches a service from inside the dashboard. Observation only.
- **Do not** make the collector proxy, retry or price anything. Read ADR 0001 before changing what it stores.
- **Do not** introduce sibling-package imports — the dashboard must remain free of business code. Emitters live in the producing app and talk HTTP.
- **Changing the wire contract is a cross-context change.** Add optional fields; never repurpose or remove one. Bump `USAGE_SCHEMA_VERSION` and update `docs/api-usage-contract.md` in the same change.
- **Do** keep `CONTEXT_FILES` in `src/cli/dashboard/config/contextFiles.ts` in sync with the repo's actual `CONTEXT.md` files. When a new CONTEXT.md is added or removed, update that list.
- **Do** run `bun run seed:usage` before judging the UI. Real data arrives only when an emitter is configured.
- **Do not** move the web UI off the `dev` task. `dev` is what turbo and the root `pnpm dev` run; putting the web UI behind `dev:web` alone means it does not start with the rest of the repo.

## Open Questions

- `PROJECTS` duplicates port + path knowledge from each sub-monorepo. Should this be derived from a single source (workspace metadata, env, or each project's own `dashboard.json`)?
- The `c` view for browsing CONTEXT.md files relies on a hardcoded list — should this be glob-discovered at runtime?
- Emitters exist only for Prompt2Blog. The remaining seams (lm-server's provider clients, Questura's Stripe/Bunny/Resend, the ABW images tree, the listicle pipeline, the alt-text sidecar) are listed in ADR 0001 — which next?
- `feature` and `provider` are free-form strings owned by each producer. Worth a shared list once more than one app emits, or is drift cheaper than coordination?
- Should the terminal UI show usage too, or is the web UI the only place that question gets asked?
