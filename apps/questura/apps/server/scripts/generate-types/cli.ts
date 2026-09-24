/**
 * `payload generate:types`, without the flaky part.
 *
 * Payload's CLI (3.90.2, tsx 4.22.4, Node 22.23) loads the config through a
 * dynamic `import()` that sometimes never settles: the event loop drains and
 * the process exits 0 having written nothing and printed nothing
 * (payloadcms/payload#17757). About half of all runs on a two-core machine,
 * and most CI runs, which then fail in `tsc` with "Cannot find module
 * '@/payload-types'" instead of at the step that broke.
 *
 * Here the config is a static import under `tsx`, which is how every
 * readiness script already loads it. And if this process is ever about to
 * exit without having written the types, it exits 1 and says so, so a silent
 * no-op cannot come back.
 */
import './load-env'

import { existsSync } from 'node:fs'

import { generateTypes } from 'payload/node'

import configPromise from '../../src/payload.config'

let finished = false
process.on('exit', (code) => {
  if (!finished && code === 0) {
    console.error('generate:types exited before writing the types. Failing instead of passing silently.')
    process.exitCode = 1
  }
})

const config = await configPromise
await generateTypes(config)

const outputFile = process.env.PAYLOAD_TS_OUTPUT_PATH || config.typescript.outputFile
if (!outputFile || !existsSync(outputFile)) {
  console.error(`generate:types finished but ${outputFile} does not exist.`)
  process.exit(1)
}
finished = true
// The config opens nothing at import time, but a plugin could; do not wait on it.
process.exit(0)
