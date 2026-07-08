---
name: ship-main
description: Commit current repository changes, reconcile local and GitHub branch state, safely merge eligible branches into main, push main, and leave a clean working tree. Use when the user asks to ship or publish current work, commit and push to main, merge ready branches, sync latest main, or get a clean working tree with latest changes.
---

# Ship Main

Goal: leave `main` clean, pushed, and up to date with `origin/main`, after committing intended changes and merging only safe branches.

## Hard Rules

- Proceed only when explicitly invoked as `$ship-main` or when the current user request directly asks to use this skill.
- Read repo instructions first: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or local equivalents.
- Never run destructive commands unless the user explicitly asks and confirms: `git reset --hard`, `git clean`, `git checkout -- <path>`, branch deletion, force push.
- Never merge every branch blindly. Treat "branches that need to be merged" as candidates that require evidence.
- Stop and ask before merging when intent, ownership, conflicts, CI, review state, or changed files are unclear.
- Prefer `main`. If repo default branch is not `main`, tell the user and ask before shipping another branch.
- If network or GitHub checks are blocked, request approval/escalation instead of skipping silently.

## Preflight

Run:

```bash
git rev-parse --show-toplevel
git status --short
git status -sb
git remote -v
git branch --show-current
git fetch --all --prune
```

Then determine GitHub/default branch:

```bash
gh repo view --json nameWithOwner,defaultBranchRef
gh pr list --state open --base main --json number,title,headRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup
```

If `gh` is unavailable, use `git remote show origin` for the default branch and state that GitHub PR/review checks are unavailable.

## Audit Changes

- Inspect unstaged and untracked changes with `git diff --stat`, `git diff --name-status`, `git diff`, and `git ls-files --others --exclude-standard`.
- Run `git diff --check`.
- Search staged/unstaged diffs and new files for obvious secrets or local env values before staging.
- Respect repo-specific validation for changed files. Run relevant fast tests, lint, or typecheck when obvious or required by instructions.
- For Payload schema edits in Questura, follow migration instructions in `AGENTS.md` before commit.

## Commit Current Work

- If no local changes exist, skip commit and continue branch/remote sync.
- Stage only intended files. Use `git add -A` only after auditing all untracked files.
- Commit with a concise inferred message unless the user supplied one:

```bash
git commit -m "<imperative summary>"
```

- If currently not on `main`, leave the commit on the current branch, then merge that branch into `main` using Merge Flow.

## Find Merge Candidates

Collect:

```bash
git branch --format='%(refname:short)'
git branch -r --format='%(refname:short)'
git branch --merged main
git branch --no-merged main
git for-each-ref --format='%(refname:short) %(upstream:short) %(committerdate:iso8601)' refs/heads refs/remotes
gh pr list --state open --base main --json number,title,headRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup
```

A branch is eligible to merge only when one of these is true:

- It is the current branch containing work just committed for this request.
- The user explicitly named it.
- It has an open GitHub PR targeting `main`, is not draft, has passing or acceptable checks, and is approved or review is not required by repo norms.

Skip and report branches that are stale, ambiguous, draft, failing checks, conflict-prone, have no PR, or appear unrelated.

## Merge Flow

1. Make sure the working tree is clean after commit:

```bash
git status --short
```

2. Update `main`:

```bash
git switch main
git pull --ff-only origin main
```

Stop if `main` diverged.

3. For each eligible branch:

- Preview commits: `git log --oneline --decorate main..<branch>`.
- Check merge base: `git merge-base main <branch>`.
- Check conflicts without changing the working tree when possible: `git merge-tree "$(git merge-base main <branch>)" main <branch>` and inspect conflict markers/output.
- Merge only if the preview is expected and no conflicts appear:

```bash
git merge --no-ff <branch> -m "Merge <branch> into main"
```

- If the branch is already fast-forwardable and the repo prefers linear `main`, `git merge --ff-only <branch>` is acceptable.
- Stop and ask on conflicts or unexpected files.

If GitHub branch protection blocks direct push, use `gh pr merge` for the PR instead of bypassing protection.

## Push And Verify

Run:

```bash
git push origin main
git fetch origin main --prune
git status -sb
git status --short
git rev-parse main
git rev-parse origin/main
git log -1 --oneline main
```

Success criteria:

- Current branch is `main`.
- `git status --short` is empty.
- `main` and `origin/main` resolve to the same commit.
- All eligible branches were merged or reported as skipped with reasons.

## Final Response

Report only:

- Commit SHA/message.
- Branches merged.
- Branches skipped with reason.
- Validation run/results.
- Final clean status.
