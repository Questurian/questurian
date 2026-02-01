# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Location Manager is a Bun-based monorepo for managing restaurant/location data with image processing and review aggregation. It consists of a React frontend, Hono API backend, shared types package, and Python ML service for alt-text generation.

## Development Commands

```bash
# Root commands (uses Turbo to run all packages)
bun install          # Install all packages
bun run dev          # Start client (3002), server (4002), and python service (8642)
bun run dev:clean    # Kill ports, reinstall, and start fresh
bun run build        # Build all packages
bun run lint         # Lint all packages (only client has ESLint configured)

# Individual package development
cd packages/client && bun run dev     # React dev server only
cd packages/server && bun run dev     # Hono server only
cd packages/python-alt-text && python3 app.py  # Python ML service
```

## Architecture

### Monorepo Structure
```
packages/
├── client/          # React 19 + Vite + TailwindCSS frontend
├── server/          # Bun + Hono API with SQLite database
├── shared/          # Shared TypeScript types and utilities
└── python-alt-text/ # FastAPI service for AI image alt-text
```

### Path Aliases (tsconfig.json)
- `@client/*` → `packages/client/src/*`
- `@server/*` → `packages/server/src/*`
- `@shared/*` → `packages/shared/src/*`

### Client Architecture (Feature-Based with ESLint Boundaries)
The client enforces strict import boundaries via `eslint-plugin-boundaries`:
- **shared/** → Global utilities/components (can only import shared)
- **features/** → Domain logic (can import shared + same feature only)
- **app/** → Bootstrap/routing (can import features + shared)

Features cannot cross-import each other. Main features: `locations`, `admin`, `health`.

### Server Architecture
- **Hono** for HTTP routing (not Express)
- **bun:sqlite** for SQLite (not better-sqlite3)
- **Sharp** for image processing
- Database at `packages/server/data/location.sqlite` with 30+ migrations
- Images stored in `packages/server/data/images/[location-name]/`

## Bun-Specific Guidelines

- Use `bun` instead of `node`, `npm`, or `yarn`
- Bun auto-loads `.env` files (no dotenv needed)
- Use `Bun.file()` over `node:fs` for file operations
- Use `bun:sqlite` for database operations
- Server runs TypeScript directly (no build step needed)

## Key Technologies

| Layer | Stack |
|-------|-------|
| Runtime | Bun 1.3.0 |
| Frontend | React 19, Vite, TailwindCSS 4, React Query, React Router DOM 7 |
| Backend | Hono 4, SQLite, Sharp |
| Forms | React Hook Form + Zod |
| UI Components | Radix UI primitives |
| ML Service | FastAPI, PyTorch, Transformers (BLIP model) |

## Environment Variables

Required: `BIGDATACLOUD_API_KEY` (timezone lookup)

Optional: `GOOGLE_MAPS_API_KEY`, `RAPID_API_KEY` (Instagram), `GEOAPIFY_API_KEY`, `PAYLOAD_API_URL`

See `.env.example` files in root and `packages/server/` for full list.

## Ports

- Client: 3002 (proxies `/api` to server)
- Server: 4002
- Python ML: 8642
