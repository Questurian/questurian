# Questurian Meta-Monorepo — Context Map

## What this is
Monorepo-of-monorepos. Each `apps/<name>` is its own bounded context with its own pnpm workspace, build, language, and ubiquitous vocabulary. This file is a **map**, not a dictionary — language lives inside each context.

## Bounded contexts

| Context | Path | Purpose | CONTEXT.md |
|---------|------|---------|------------|
| AI Blog Writer | `apps/ai-blog-writer` | Multi-stage AI content pipeline (YouTube/URL/Prompt → Markdown + LexicalJSON). | [link](./apps/ai-blog-writer/CONTEXT.md) |
| Location Manager | `apps/location-manager` | Internal admin tool. Enrich Location data + sync to Payload CMS. | [link](./apps/location-manager/CONTEXT.md) |
| Questura | `apps/questura` | Public travel-guide Payload CMS + Next.js site. Consumes Location Manager output. | [link](./apps/questura/CONTEXT.md) |
| Dashboard | `apps/dashboard` | Ink/Hono CLI dashboard. Monitor dev services across contexts. | [link](./apps/dashboard/CONTEXT.md) |

## Cross-context translation

- `location-guide-contract.json` — schema bridging **Location Manager → Questura**. Defines geo hierarchy (`country` → `city` → `neighborhood`), `aiFieldPaths` (fields AI Blog Writer fills), resolution precedence (neighborhood > city > country), array merge strategy (replace-on-non-empty).
- **No code-level imports between sub-monorepos.** Coupling is HTTP (Location Manager → Payload) + the contract above.

## Global tooling

- Workspace: `pnpm-workspace.yaml` (pnpm@10).
- Task runner: Turbo (`turbo.json`). Top-level scripts in root `package.json`: `pnpm run dashboard | questura | dev | build | lint | test`.
- Nx config also present (`.nx/`) but Turbo is the primary orchestrator.

## Package scopes

| Scope | Where |
|-------|-------|
| `@questurian/*` | Shared across the meta-mono (e.g. `@questurian/dashboard`, `@questurian/lm-shared`, `@questurian/abw-converter`) |
| `@questura/*` | Lives only inside `apps/questura` (`@questura/client`, `@questura/server`) |

## How to use this map

When working inside a sub-monorepo: read **that** CONTEXT.md first. Use this file only to understand cross-context flow or to find which context owns a concept.
