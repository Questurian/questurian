# Backend staff authorization for costly and destructive routes

ABW's shared API key is not caller identity because Vite exposes it in the
frontend bundle. Routes that spend provider money or destroy local data use
the Payload Staff session instead: the backend resolves the bearer token
through Payload's `/api/users/me` endpoint whenever
`ABW_REQUIRE_STAFF_AUTH=true`.

Enforcement remains opt-in so deployment can follow the frontend version that
sends Staff sessions. While enforcement is off, startup logs emit a warning
that costly and destructive routes are unprotected.

Authorization rules when enforcement is on:

- Any verified Staff role may use guarded generation and pipeline routes.
- Only `editor` and `admin` may clear all YouTube2Blog runs.
- A `writer` may delete an article-producing pipeline run only when that run's
  `owner_staff_id` matches their verified Payload User id.
- `editor` and `admin` may delete any article-producing pipeline run.
- A run with no verified owner may be deleted only by `editor` or `admin`.

New YouTube2Blog, Prompt2Blog, and URL2Blog runs record the verified Staff User
id in `runs.owner_staff_id`. Ownership is assigned once and later status writes
cannot transfer it. Runs created while enforcement is off remain unowned;
there is no identity to backfill safely.

Guard coverage is curated per route so polling and result reads remain open.
Covered operations include pipeline starts and expansion, itinerary generation,
FLUX editing, AI image-text helpers, Editor Assist generation/rewrite, prompt
synthesis/classification, YouTube AI probes, bulk run clear, article deletion,
article-type and Day Shell deletion, and single/bulk staged-draft deletion.

## Consequences

- Payload remains authoritative for active Staff identity and current role.
- Enabling enforcement before deploying a frontend that sends the Staff
  session causes guarded requests to return `401`.
- Legacy/unowned runs are intentionally safer: writers cannot claim or delete
  them, while editors/admins can clean them up.
- New costly or destructive routes require an explicit authorization decision;
  router-wide authentication is not assumed because read/poll routes must stay
  available.
