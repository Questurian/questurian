/**
 * Fresh sessions for a load run, written where only this user can read them.
 *
 *   pnpm readiness:sessions      # prints the path of the file it wrote
 *
 * Signs every synthetic identity in against the running stack
 * (`identities.ts`) and writes `{ label: cookie }` to
 * `$TMPDIR/questura-readiness/sessions.json`, mode 0600. k6 reads it with
 * `SESSIONS_FILE`. The file is never committed, never logged, and dies with
 * the stack (`readiness:stack -- down` removes the state directory's stack
 * record; the file is overwritten on the next run).
 */
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { signInAll } from './identities'
import { LAUNCH_MANIFEST_PATH, type LaunchManifest } from './launch-corpus'
import { assertPreflight } from './preflight'
import { sandboxSettings } from './sandbox'
import { readStackState, STACK_PORTS, STATE_DIR } from './stack'

async function main(): Promise<void> {
  assertPreflight(sandboxSettings())
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up')
  const manifest = JSON.parse(readFileSync(LAUNCH_MANIFEST_PATH, 'utf8')) as LaunchManifest
  const jar = await signInAll(manifest, {
    backend: `http://127.0.0.1:${STACK_PORTS.backend}`,
    origin: stack.origins.client,
    redisUrl: `redis://127.0.0.1:${STACK_PORTS.redis}`,
  })
  const path = resolve(STATE_DIR, 'sessions.json')
  writeFileSync(path, JSON.stringify(Object.fromEntries(jar), null, 2), { mode: 0o600 })
  chmodSync(path, 0o600)
  console.log(path)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
