# Dashboard — Context

## Purpose
Terminal CLI + HTTP service for monitoring dev services (health, port, type) across the meta-monorepo. Pure observer — does not own any business data.

## Tech stack
- TypeScript on Bun runtime
- Hono (HTTP server)
- Ink (React-based terminal UI) + React 19
- ink-big-text, ink-gradient, ink-spinner

## Ubiquitous language

| Term | Definition |
|------|------------|
| `ServiceConfig` | Service shape: `url`, `healthPath`, `port`, `type`, `slowStartup`. |
| `type` | One of `"python" \| "bun" \| "node" \| "vite" \| "next" \| "payload"`. |
| `ServiceStatus` | `"online" \| "offline" \| "checking" \| "starting"`. |
| `ProjectConfig` | One row in the dashboard: `name`, `description`, `path`, optional `client`, optional `server`, `commands`. |
| `ProjectCommands` | Per-project commands: `dev`, `devClean`, `build?`, `lint?`, `test?`, plus custom entries. |
| `GlobalCommand` | Top-level command: `cmd`, `description`, `category` (`"turbo" \| "docker" \| "utility"`). |
| `PROJECTS` | Static list of `ProjectConfig` in `src/cli/dashboard/config/projects.ts`. |
| `GLOBAL_COMMANDS` | Static list of `GlobalCommand`. |

## Routes

- `GET /` — service metadata
- `GET /projects` — project list
- `GET /health`, `/health/ready`, `/health/live`
- `GET /commands` — global commands

## Boundary

- **Owns:** UI render, periodic health polling, command-metadata catalogue.
- **Delegates:** actually running anything (turbo/pnpm commands are launched outside the dashboard process).

## Shared contracts

Standalone — no sibling-package imports. Only depends on Hono, Ink, React.
