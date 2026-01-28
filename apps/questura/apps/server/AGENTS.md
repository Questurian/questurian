# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` holds Next.js App Router routes, including API handlers under `src/app/api/`.
- `src/features/` is the main feature layer (auth, payments, media, emails, admin).
- `src/shared/` contains shared config, helpers, and types used across features.
- `src/payload.config.ts` and `src/payload-types.ts` define Payload CMS configuration and generated types.
- `docs/` includes deeper references (access control, CDN variants, URLs).
- `scripts/` and `src/features/**/scripts/` contain backfills and seed tasks.
- Tests live in `src/shared/lib/*.test.ts` and `src/**/__tests__/*.test.ts`.

## Build, Test, and Development Commands
- `pnpm dev`: start the Next.js + Payload dev server on port 4000.
- `pnpm devsafe`: clear `.next/` and start fresh (useful for cache issues).
- `pnpm build`: generate Payload types, then build for production.
- `pnpm start`: run the production build.
- `pnpm lint`: run ESLint (Next.js core-web-vitals + TypeScript rules).
- `pnpm test` or `pnpm test:int`: run Vitest with `vitest.config.ts`.
- `pnpm generate:types`: regenerate `src/payload-types.ts` after collection changes.

## Coding Style & Naming Conventions
- TypeScript, ES modules, strict mode (`tsconfig.json`).
- Prettier is authoritative: single quotes, no semicolons, trailing commas, 100-char width.
- ESLint warns on `any` and unused vars; prefix unused args with `_`.
- Keep feature folders and files lowercase; tests use `*.test.ts`.
- Prefer path aliases like `@/features/...` or `@/shared/...` over relative hops.

## Testing Guidelines
- Framework: Vitest with `jsdom`; Next.js `headers()` is mocked.
- Default include is `src/shared/lib/*.test.ts`. If adding tests elsewhere, run directly:
  `pnpm test -- --run src/app/api/auth/forgot-password/__tests__/request.test.ts`
- Use helpers in `src/test-utils.ts` for shared setup.

## Commit & Pull Request Guidelines
- Commit messages in history are short, lowercase, and imperative (e.g., “fix bug”, “add writer role”).
- PRs should include: summary, linked issue, test status (`pnpm test`), and any env/config changes.
- If you touch collections, call out that `pnpm generate:types` was run.

## Security & Configuration Tips
- Use `.env.local` for secrets; never commit credentials.
- Node 18.20.2+ or 20.9.0+ and pnpm are required.
- Stripe/Resend/Bunny credentials are mandatory for full feature testing.
