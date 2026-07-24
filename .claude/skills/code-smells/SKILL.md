---
name: code-smells
description: Scan code for 18 common code smells (redundant/duplicate/dead code, complexity, poor naming, magic numbers, missing error handling, weak validation, global mutable state, tight coupling, resource leaks, race conditions, hardcoded values, inconsistent formatting, missing tests, security vulnerabilities, premature optimization, poor documentation) and produce a structured report. Use when user asks for a code smell scan, code quality audit, "check for smells", "/code-smells", or wants a report of quality issues in files, a directory, or the current diff.
---

# Code Smells Report

Scan a target (file, directory, or diff) against the 18-smell checklist in
[CHECKLIST.md](CHECKLIST.md) and return a report. This skill **reports only** —
do not edit any files unless the user separately asks for fixes.

## Workflow

1. **Determine scope.**
   - If the user named files/directories, use those.
   - If they said "my changes" or similar, use `git diff` (staged + unstaged + branch vs main).
   - If no scope given and the repo is large (>30 source files), ask which area to scan;
     otherwise scan the whole repo's source files.
   - Skip: generated files, lockfiles, vendored deps, `node_modules`, build output,
     migrations, and minified assets.

2. **Read the checklist.** Load [CHECKLIST.md](CHECKLIST.md) for the 18 smell
   definitions and per-smell detection hints (grep patterns, what counts, what to ignore).

3. **Scan.** Read each in-scope file fully. Use Grep for cross-file smells
   (duplicate logic, dead exports, hardcoded values repeated in several places).
   For each candidate finding, verify it before reporting — e.g. confirm an
   "unused" function isn't referenced elsewhere, confirm a "magic number" isn't
   already obvious from context (like `* 100` for percent).

4. **Rank.** Severity order: `critical` (security vulnerabilities, leaked secrets)
   → `high` (missing error handling, race conditions, resource leaks, unsafe input)
   → `medium` (duplicate logic, dead code, tight coupling, global mutable state,
   missing tests) → `low` (naming, magic numbers, formatting, documentation,
   premature optimization).

5. **Report.** Output the report in the format below. Do not pad it — if a smell
   category has no findings, omit it entirely.

## Report format

```markdown
# Code Smell Report — <scope>

**Files scanned:** N · **Findings:** N (X critical, X high, X medium, X low)

## Critical
- `path/file.ts:42` — [security] Hardcoded API key committed to source.
  *Fix:* move to env var, rotate the key.

## High
- `path/other.ts:88` — [missing-error-handling] `fetch` result used without
  checking `res.ok`; a 500 response crashes the page.
  *Fix:* check `res.ok` and handle failure.

... (Medium / Low sections)

## Clean
Categories checked with no findings: dead code, race conditions, ...
```

Every finding needs: `file:line`, the smell tag in brackets, a one-sentence
statement of the defect, and a one-line suggested fix. No fabricated line
numbers — cite only lines you actually read.

## Scope limits

- Max ~40 files per scan; if scope exceeds that, report the largest offenders
  and say the scan was partial.
- Style-only findings (formatting, naming) should never outnumber substantive
  ones in the report — cap them at the 5 clearest examples and note the pattern.
