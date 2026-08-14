---
name: deploy-live
description: >
  Show live Questura deploy status and drive a deploy, rollback, or health
  check on the Linux laptop. Use when the user says "deploy", "ship to live",
  "push to production", "deploy-live", "is live up to date", "roll back",
  "what's live right now", or invokes /deploy-live.
---

Deploy assistant for Questura's one and only runtime: the Linux laptop at
`ssh linux-laptop`. There is no localhost Questura. See `AGENTS.md`.

**Always show status before doing anything.** The user should never have to ask
"what state am I in?" — lead with it, then offer choices. Never deploy or roll
back without an explicit pick.

## Step 1 — Gather status

Run these together in one message. All are read-only and safe.

```bash
# local git state
git status --porcelain
git rev-parse --abbrev-ref HEAD
git fetch --quiet origin main && git rev-parse origin/main

# what is actually serving right now
curl -s --max-time 12 https://cms.questurian.com/api/health
curl -s --max-time 12 https://www.questurian.com/api/health

# CI verdict for the tip of main
gh run list --branch main --limit 1 --json status,conclusion,headSha,displayTitle
```

If a PR is open for the current branch, add
`gh pr view --json number,title,state,statusCheckRollup,mergeable`.

Derive:

- `live_sha` — `releaseSha` from the two health endpoints. **They must match
  each other.** If they differ, the client and server are on different releases;
  say so loudly, that is a broken deploy needing `rollback.sh all`.
- `behind` — `git rev-list --count <live_sha>..origin/main`
- `undeployed` — `git log --oneline <live_sha>..origin/main`

## Step 2 — Show the panel

Compact, scannable, no wall of text. Shape:

```
LIVE   6523e76  healthy · db connected 3ms · node v22.23.2
MAIN   86b9f48  CI passed
       3 commits not yet live:
         86b9f48 Merge pull request #251 …
         a078917 docs: state why the laptop serves …
         27a4f75 ci: run tests, lint and typecheck …
LOCAL  main · clean
```

Flag anything that would make a deploy fail or surprise them, in plain words:

- dirty working tree → uncommitted work will **not** ship; only `origin/main` deploys
- local branch is not `main` → their work is not on main yet, offer the PR path
- CI failing or pending on the tip of main → deploying will likely fail at the
  test step (harmless — it aborts before touching live), but wait instead
- `live_sha` not an ancestor of `origin/main` → live is running something that
  is not on main; stop and investigate, do not deploy over it
- health endpoint unreachable → say the site is down before offering a deploy
- pending migrations in the undeployed commits — check with
  `git diff --stat <live_sha>..origin/main -- apps/questura/apps/server/src/migrations`
  → warn that this deploy changes the database and is **not** undoable by rollback

## Step 3 — Offer options

Use `AskUserQuestion`. Only offer what makes sense for the state observed —
don't offer "deploy" when live already matches main, don't offer "rollback"
when there is no `previous-*` release. Typical set:

- **Deploy main to live** — ships `<sha>`, ~N commits, runs tests before touching live
- **Just check health** — already done, re-run and stop
- **Roll back to previous release** — swaps back to the prior code release
- **Open a PR for this branch first** — when they're on a branch with local work

Say what each one actually does in one line. No jargon.

## Step 4 — Deploy

```bash
ssh linux-laptop '~/questura/deploy.sh' 2>&1 | tee /tmp/questura-deploy.log
```

Long-running (several minutes: install, build, test, lint, migrate, publish).
Run it in the background and report progress rather than going silent.

Reassure once, at the start, because it is true: the deploy stages a private
copy and builds, tests and lints it **before** touching anything live. If it
fails before publication, staging is removed and live is untouched. If it fails
between server and client activation, both links are restored.

Do not paste the whole log. Report the phase it reached and, on failure, the
error lines only. Full log stays at `/tmp/questura-deploy.log`.

## Step 5 — Verify

Never trust the deploy's own exit code alone. Re-poll both health endpoints and
confirm `releaseSha` equals `origin/main` on **both**:

```bash
curl -s --max-time 12 https://cms.questurian.com/api/health
curl -s --max-time 12 https://www.questurian.com/api/health
```

Report: `LIVE 86b9f48 ✓ matches main · healthy · db connected`.

If only one moved, that is a split release — tell them plainly and offer
`rollback.sh all`.

## Step 6 — On failure

State which phase failed, quote the error, then offer:

1. Fix forward — diagnose, new commit, new PR, deploy again
2. Roll back the code — `ssh linux-laptop '~/questura/app/apps/questura/infra/softprod/rollback.sh all'`
3. Leave it — if the deploy aborted before publication, live is already fine and
   there is nothing to undo. Say so rather than offering a pointless rollback.

## Hard rules

- **Never edit `~/questura/app` on the host.** The deploy wrapper runs
  `git reset --hard origin/main` on it every time; edits there are destroyed.
- **Never bypass the migration preflight.** There is no `--force` and adding one
  is not an option. If the preflight blocks destructive SQL, stop and walk the
  user through the manual path in `apps/questura/infra/softprod/README.md`:
  back up, record row counts for `locations`, `articles`, `media_assets`,
  `media_sets`, `users`, `visitor_profiles`, `visitor_auth_*`, review every
  pending `up()` body, get explicit approval, run the batch, redeploy.
- **Rollback restores code, never data.** Say this out loud any time a deploy
  carries a migration. Additive migrations are safe to roll back past; anything
  that drops, renames, or rewrites is a one-way door.
- **The host runs live Stripe** (`rk_live`/`pk_live`, real money). A deploy
  itself charges nobody, but never trigger a checkout to "test" a deploy.
- Deploying is not destructive and needs no confirmation beyond the user picking
  it. Rollback and any manual migration **do** need explicit confirmation.
