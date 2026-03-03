# Questurian

Turborepo monorepo for Questurian projects.

## Running Projects

```bash
# Install all workspace dependencies
pnpm install

# Run all in dev/watch mode
pnpm run dev
# Note: AI Blog Writer runs local dev services by default (Docker is opt-in via `pnpm -C apps/ai-blog-writer run dev:docker`)

# Build everything
pnpm run build

# Run a single package (example: dashboard)
pnpm turbo run dev --filter=@questurian/dashboard
```
