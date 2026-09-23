/**
 * pnpm env:check <env-file>
 *
 * Runs the production boot check against an env file, the way Railway would
 * hand those variables to the server, and prints what would stop it booting.
 * Messages are redacted (`boot-env.ts`). Exit 0 means the server would boot,
 * and 1 means it would refuse. Nothing is deployed and nothing is contacted.
 *
 * The file replaces the environment for the check: a variable set in your
 * shell does not count.
 */
import { readFileSync } from 'node:fs'

import { parse } from 'dotenv'

import { platformProblems, redact, RUNTIME_KEYS, runBootCheck } from './boot-env'

async function main(): Promise<void> {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: pnpm env:check <env-file>')
    process.exit(2)
  }

  const env = parse(readFileSync(file, 'utf8'))
  const { problems, keysRead } = await runBootCheck(env)
  const all = [...platformProblems(env), ...problems].map((problem) => redact(problem, env))

  const unsetButRead = keysRead.filter((key) => !(key in env) && !RUNTIME_KEYS.has(key))

  console.log(`Checked ${file}: ${Object.keys(env).length} variables set, ${keysRead.length} read by the boot check.`)
  if (unsetButRead.length > 0) {
    console.log(`Read but not set (defaults apply): ${unsetButRead.join(', ')}`)
  }

  if (all.length === 0) {
    console.log('The production boot check passes. The server would boot.')
    return
  }

  console.log(`\nThe server would refuse to boot (${all.length}):`)
  for (const problem of all) console.log(`  - ${problem}`)
  process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
})
