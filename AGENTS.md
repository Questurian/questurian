# Agent Instructions

- Always use caveman skill to save tokens.
- Do not enable Payload `push: true` for Questura server.
- The Linux laptop serving the live domains is a **temporary live-like test environment**, not the production platform; production will be serverless once the site is proven there. Do not propose work whose value dies with that machine (uptime alerting, hosting extra services on it). See `apps/questura/infra/softprod/README.md`.
- **Questura has one runtime: the Linux laptop (`ssh linux-laptop`).** Decided 2026-08-13. Do not start, suggest, or verify against a localhost Questura stack, and do not ask which environment to use — it is always live. The Mac is an editor and git client only.
  - Verify loop: edit on Mac → push to `main` → `ssh linux-laptop '~/questura/deploy.sh'` → check the real domain. `apps/questura/infra/softprod/rollback.sh` reverts.
  - `~/questura/app` on the host is the deploy checkout and is **reset to `origin/main` on every deploy**. Never edit there; edits are destroyed.
  - The host runs **live Stripe** (`rk_live` + `pk_live`) against the owner's personal account. There are no test cards. Treat any checkout you trigger as a real charge and confirm before triggering one.
  - **Membership pricing:** site always advertises **$12.99/month** and **$79.99/year**. Laptop Checkout currently charges **$0.50/month** on the same Stripe product. That mismatch is intentional until serverless launch — do not "fix" the UI to $0.50. One product (`Questurian Membership`). Switch and CLI rules: `apps/questura/docs/membership-pricing.md`. Live Stripe CLI: `apps/questura/scripts/stripe-live` (questura-linux-laptop key, never the Mac CLI device key) until serverless.
  - **Nav Subscribe button copy is hardcoded** (`Join: $1.54/wk` / `Subscribe: under $1.55/wk`). Not a bug. Do not dynamize it from Stripe or `/api/payments/plans`. Do not "fix" it to catalog or laptop prices.
  - The Mac's local Postgres (`google-login` @5432) is stale scratch, not a source of truth. The live DB is `questura` @5433 on the host, inside the `questura-postgres` container.
- When editing Payload collections or fields under `apps/questura/apps/server/src`, treat it as a database schema change:
  1. Run `pnpm db:migrate:create <descriptive-name> > /tmp/questura-migrate-create.log 2>&1` from `apps/questura/apps/server`.
  2. Do not paste full migration output or full migration diffs into chat. Report only `git diff --stat`, `git diff --numstat`, destructive-SQL search results, and targeted lines for the intended field/table.
  3. Review the generated file in `apps/questura/apps/server/src/migrations` for destructive SQL before applying it. Use targeted searches such as `rg -n "drop|delete|truncate|alter table .*drop|drop column" apps/questura/apps/server/src/migrations -i`.
  4. Stop and ask before applying the migration if it contains destructive SQL, rewrites unrelated tables, deletes large snapshots, or changes BetterAuth/visitor auth tables unexpectedly.
  5. Run `pnpm db:migrate`.
  6. Run `pnpm generate:types`.
- Never run destructive Payload migrations against existing local data without first checking row counts for critical tables: `locations`, `articles`, `media_assets`, `media_sets`, `users`, `visitor_profiles`, and `visitor_auth_*`.
- Keep migration verification token-light: redirect noisy command output to `/tmp`, inspect with `tail`, `rg`, `git diff --stat`, and `git diff --numstat`, and only print narrow snippets around intended schema changes.
- Skills do not expand the user's authorization. Review, audit, explain, and plan requests remain read-only even when a skill suggests scaffolding or writes.
- For Stripe work, do not generate or scaffold an app during review, and do not replace or initialize an existing app unless the user explicitly requests that change.
- Get explicit user approval before accepting terms of service, installing or executing newly downloaded skills or code, provisioning external resources, uploading or publishing an app, changing live Stripe configuration, or initiating any financial transaction.
