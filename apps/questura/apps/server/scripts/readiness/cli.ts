import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  createSandboxDatabase,
  dropSandboxDatabase,
  sandboxDatabaseName,
  sandboxPool,
  REFRESH_JOBS_DDL,
} from './database'
import { assertPreflight } from './preflight'
import { buildManifest, sandboxSettings } from './sandbox'

/**
 * `pnpm readiness <check|up|down|manifest>`.
 *
 * Deliberately small. The sandbox is a database, a namespace and a manifest;
 * anything more elaborate becomes a thing to maintain instead of a thing to
 * trust. `down` drops only what the manifest says this harness created.
 */

const MANIFEST_PATH = resolve(process.cwd(), '../../docs/capacity/runs/readiness-sandbox.json')

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'check'
  const settings = sandboxSettings()

  if (command === 'check') {
    assertPreflight(settings)
    console.log(`Preflight passed. Sandbox database: ${sandboxDatabaseName()}`)
    return
  }

  if (command === 'up') {
    assertPreflight(settings)
    await createSandboxDatabase()
    const pool = sandboxPool(2)
    try {
      await pool.query(REFRESH_JOBS_DDL)
    } finally {
      await pool.end()
    }
    writeManifest(settings)
    console.log(`Sandbox ready: ${sandboxDatabaseName()} (manifest at ${MANIFEST_PATH})`)
    return
  }

  if (command === 'down') {
    assertPreflight(settings)
    await dropSandboxDatabase()
    console.log(`Dropped ${sandboxDatabaseName()}.`)
    return
  }

  if (command === 'manifest') {
    writeManifest(settings)
    console.log(`Wrote ${MANIFEST_PATH}`)
    return
  }

  throw new Error(`Unknown command "${command}". Use check, up, down or manifest.`)
}

function writeManifest(settings: ReturnType<typeof sandboxSettings>): void {
  const seed = Number(process.env.READINESS_SEED ?? 20260922)
  const manifest = buildManifest(settings, seed, [
    `postgres database ${sandboxDatabaseName()}`,
    `redis keys under ${settings.redisNamespace}`,
  ])
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true })
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
