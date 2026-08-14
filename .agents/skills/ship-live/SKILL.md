---
name: ship-live
description: >
  The whole Questura pipeline in one command: branch, commit, PR, CI, merge,
  deploy to the Linux laptop, verify. Detects where the work already is and
  offers the next step. Use when the user says "ship", "ship it", "ship-live",
  "deploy", "push this live", "send to production", "what's live", "where am
  I", "roll back", or invokes /ship-live.
---

Questura has one runtime: the Linux laptop (`ssh linux-laptop`). There is no
localhost Questura. See `AGENTS.md`.

This skill owns the entire path from an edited file to verified-live. Invoke it
at any point — before starting work, mid-change, or after merging. It works out
which stage the work is in and offers only what makes sense from there.

**Lead with status, always.** The user should never have to reconstruct where
they are. Show the board, then offer choices.

## Step 1 — Locate the work

Run together; all read-only.

```bash
git status --porcelain
git rev-parse --abbrev-ref HEAD
git fetch --quiet origin main && git rev-parse origin/main
gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --state open --json number,title,mergeable,statusCheckRollup
gh run list --branch main --limit 1 --json status,conclusion,headSha
curl -s --max-time 12 https://cms.questurian.com/api/health
curl -s --max-time 12 https://www.questurian.com/api/health
```

Then classify into exactly one **stage**:

| stage | condition | next step |
|---|---|---|
| `DIRTY` | uncommitted changes | branch (if on main) + commit |
| `UNPUSHED` | committed, no remote branch or ahead of it | push + open PR |
| `PR_RUNNING` | PR open, checks pending | wait for CI |
| `PR_RED` | PR open, checks failed | stop, report failures |
| `PR_GREEN` | PR open, checks passed, mergeable | merge |
| `MAIN_AHEAD` | main clean, live SHA behind main | deploy |
| `MAIN_CI` | main ahead of live but CI on main tip pending | wait, then deploy |
| `LIVE_CURRENT` | live SHA == origin/main | nothing to do |
| `DIVERGED` | live SHA not an ancestor of origin/main | **stop**, investigate |
| `SPLIT` | cms and www report different `releaseSha` | **stop**, offer `rollback.sh all` |

`DIVERGED` and `SPLIT` are never auto-resolved. Explain and stop.

## Step 2 — Show the board

```
LOCAL  main · clean
MAIN   6f07f4a  CI passed
LIVE   6f07f4a  healthy · db 3ms · cms + www agree ✓
       up to date — nothing to ship
```

or mid-flight:

```
LOCAL  agent/fix-checkout · 2 files changed, uncommitted
PR     none yet
MAIN   6f07f4a
LIVE   6f07f4a  healthy · cms + www agree ✓
       → next: commit and open a PR
```

Flag in plain words, only when true:

- migrations among the commits about to ship — check
  `git diff --stat <live_sha>..origin/main -- apps/questura/apps/server/src/migrations`
  → this deploy **changes the database and rollback will not undo it**
- health endpoint unreachable → the site is down; say so before offering anything
- CI red → name the failing job, don't offer to merge

## Step 3 — Offer the next step

Use `AskUserQuestion`. Always include a **"run the whole thing"** option when
the stage is `DIRTY`, `UNPUSHED`, `PR_GREEN`, or `MAIN_AHEAD` — that is the
point of this skill. Also offer the single next step alone, and "just status".

Phrase options as outcomes, not commands: "Ship it all the way to live
(~8 min, I'll report each stage)" beats "run git push && gh pr create".

## Step 4 — Run the chain

Once they pick "ship it all", run straight through **without asking again**,
reporting each stage as it completes. Stop only on the exceptions below.

1. **Branch** — if on `main`, `git switch -c agent/<kebab-summary>`. Never
   commit directly to main.
2. **Audit** — `git diff --check`, then scan the diff and every untracked file
   for secret-shaped strings (`sk_live`, `rk_live…`, `whsec_…`, `postgres://…:…@`,
   private keys). Stop if anything hits.
3. **Payload schema check** — if the diff touches
   `apps/questura/apps/server/src` collections or fields, stop and follow the
   migration procedure in `AGENTS.md` before committing. Do not improvise.
4. **Commit** — inferred message: imperative subject, body explaining *why*.
   Never add AI attribution trailers.
5. **Push + PR** — `git push -u origin HEAD`, then `gh pr create` with a body
   covering why / what / verification.
6. **Wait for PR CI** — poll with `Monitor`, emit each check as it lands. Never
   `sleep` in the foreground.
7. **Merge** — `gh pr merge --merge --delete-branch`, then
   `git switch main && git pull --ff-only`.
8. **Wait for main CI** — the push to main starts a second run on the merge
   commit. Wait for it. Same content already passed, but a green tip is the
   precondition for deploying.
9. **Deploy** — `ssh linux-laptop '~/questura/deploy.sh'`, backgrounded, log to
   `/tmp/questura-deploy.log`, phases streamed with `Monitor`.
10. **Verify** — Step 5 below.

Say once, at the deploy: it stages a private copy and builds, tests and lints
it **before** touching anything live. A failure before publication removes
staging and leaves the running site untouched.

**Stop the chain and ask only for:** secrets found, Payload schema changes, CI
red, migration preflight blocked, deploy failure, `DIVERGED`, `SPLIT`.
Everything else runs through.

## Step 5 — Verify

Never trust the deploy's exit code. Re-poll both endpoints and require
`releaseSha` == `origin/main` on **both**:

```bash
curl -s --max-time 15 https://cms.questurian.com/api/health
curl -s --max-time 15 https://www.questurian.com/api/health
```

Report `LIVE 6f07f4a ✓ matches main · healthy · db connected`. If only one
moved, that is a split release — say so plainly and offer `rollback.sh all`.

## Step 6 — On failure

Name the stage, quote the error lines only (never the whole log — it stays at
`/tmp/questura-deploy.log`), then offer:

1. Fix forward — diagnose, new commit, rerun the chain
2. Roll back the code —
   `ssh linux-laptop '~/questura/app/apps/questura/infra/softprod/rollback.sh all'`
3. Nothing — if the deploy aborted before publication, live was never touched.
   Say so rather than offering a pointless rollback.

## Monitoring rules

- Never `sleep` in the foreground to wait; use `Monitor` with a loop that exits
  on a terminal state, or `Bash` with `run_in_background`.
- Deploy phase filter: `^==>` plus failure signatures. Anchor failure words so
  test names containing "refuses" or "failed" don't produce false alarms —
  match `^ERROR|^FATAL|not ok |Error:|Aborted` rather than bare substrings.
- A silent monitor must not look like success: the filter has to match failure
  states too, not just progress markers.

## Hard rules

- **Never edit `~/questura/app` on the host.** The deploy wrapper runs
  `git reset --hard origin/main` on it every deploy; edits there are destroyed.
- **Never bypass the migration preflight.** There is no `--force`. If it blocks,
  walk the manual path in `apps/questura/infra/softprod/README.md`: back up,
  record row counts for `locations`, `articles`, `media_assets`, `media_sets`,
  `users`, `visitor_profiles`, `visitor_auth_*`, review every pending `up()`
  body, get explicit approval, run the batch, redeploy.
- **Rollback restores code, never data.** Say it out loud whenever a deploy
  carries a migration.
- **The host runs live Stripe** (`rk_live`/`pk_live`, real money, no test cards).
  A deploy charges nobody, but never trigger a checkout to "test" one.
- Deploying needs no confirmation beyond the user picking it. Rollback, manual
  migrations, and force-push **always** need explicit confirmation.
