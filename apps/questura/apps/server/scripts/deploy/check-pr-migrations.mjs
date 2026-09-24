#!/usr/bin/env node

/**
 * The pull-request half of the migration guard.
 *
 * `check-pending-migrations.mjs` stops a risky migration at deploy time, on
 * the laptop and in Railway's pre-deploy step. That is the last possible
 * moment: the code is merged, the release is built, and the deploy fails.
 * This runs the same inspection on every migration file a pull request adds
 * or changes, so the question is asked while the change is still a diff.
 *
 * A risky migration is allowed through CI only when the pull request body
 * names it on a line of its own:
 *
 *   Acknowledge-risky-migration: 20260924_120000_drop_old_column
 *
 * The marker is per migration, so acknowledging one never waves through
 * another added later to the same PR. It only turns CI green. The deploy
 * guard still refuses the migration, and the manual procedure in
 * docs/procedures/backup-restore-rollback.md (backup point first, then the
 * migration by hand) is the only way it reaches production.
 *
 *   node scripts/deploy/check-pr-migrations.mjs [--base <git ref>]
 *
 * `--base` defaults to `HEAD^1`, which is the base branch when CI checks out
 * GitHub's merge commit. The PR body is read from `PR_BODY`.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { inspectMigration } from './check-pending-migrations.mjs'

export const ACK_MARKER = 'Acknowledge-risky-migration'

const MIGRATIONS_DIR = 'apps/questura/apps/server/src/migrations/'

/** Migration names acknowledged in a PR body, one `Acknowledge-risky-migration: <name>` per line. */
export function parseAcknowledgements(body) {
  const names = new Set()
  const pattern = new RegExp(`^[\\t >*-]*${ACK_MARKER}:[\\t ]*([A-Za-z0-9_]+)[\\t ]*$`, 'gim')
  for (const match of String(body ?? '').matchAll(pattern)) names.add(match[1])
  return names
}

/** The migration files among a list of changed repository paths (index.ts is the registry, not a migration). */
export function migrationFilesIn(changedPaths) {
  return changedPaths
    .filter((file) => file.startsWith(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .filter((file) => !file.slice(MIGRATIONS_DIR.length).includes('/'))
    .filter((file) => path.basename(file) !== 'index.ts')
}

/**
 * Inspect each changed migration. A migration that cannot even be parsed is
 * risky: the deploy guard would refuse it too.
 */
export function evaluatePullRequestMigrations({ migrations, body }) {
  const acknowledged = parseAcknowledgements(body)
  const results = migrations.map(({ name, source }) => {
    let risks
    try {
      risks = inspectMigration(source, name).risks
    } catch (error) {
      risks = [`cannot be inspected: ${error.message}`]
    }
    const status = risks.length === 0 ? 'safe' : acknowledged.has(name) ? 'acknowledged' : 'blocked'
    return { name, risks, status }
  })
  return {
    results,
    blocked: results.filter(({ status }) => status === 'blocked'),
    acknowledged: results.filter(({ status }) => status === 'acknowledged'),
  }
}

function parseArguments(argv) {
  let base = 'HEAD^1'
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--base' && argv[index + 1]) {
      base = argv[index + 1]
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${argv[index]}`)
  }
  return { base }
}

function main() {
  const { base } = parseArguments(process.argv.slice(2))
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD', '--', MIGRATIONS_DIR],
    { cwd: repoRoot, encoding: 'utf8' },
  ).split('\n').filter(Boolean)

  const files = migrationFilesIn(changed)
  if (files.length === 0) {
    console.log('No migration files added or changed.')
    return
  }

  const migrations = files.map((file) => ({
    name: path.basename(file, '.ts'),
    source: fs.readFileSync(path.join(repoRoot, file), 'utf8'),
  }))
  const { results, blocked } = evaluatePullRequestMigrations({ migrations, body: process.env.PR_BODY })

  console.log('Migrations added or changed by this pull request:')
  for (const { name, risks, status } of results) {
    console.log(`  ${name}: ${status}${risks.length > 0 ? ` (${risks.join(', ')})` : ''}`)
  }

  if (blocked.length > 0) {
    console.error(
      `\n${blocked.length} risky migration(s) are not acknowledged. The deploy guard will refuse them, ` +
        'so they need the manual procedure in apps/questura/docs/procedures/backup-restore-rollback.md ' +
        '(record a restore point, then migrate by hand). If that is the plan, add to the PR description:\n\n' +
        blocked.map(({ name }) => `${ACK_MARKER}: ${name}`).join('\n'),
    )
    process.exitCode = 1
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    main()
  } catch (error) {
    console.error(`Migration check failed: ${error.message}`)
    process.exitCode = 1
  }
}
