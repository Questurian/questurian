/**
 * The readiness integration tests, where skipping is failing (surge plan L09).
 *
 *   pnpm readiness:required
 *
 * Runs every `scripts/readiness/*.integration.test.ts` with
 * `READINESS_REQUIRED=1` — an unreachable disposable database throws instead
 * of skipping — and then reads vitest's own report: the command fails if any
 * test failed, **any test was skipped or pending**, or nothing ran at all.
 * It prints executed/skipped counts, so the CI log states what was executed
 * rather than a green tick that could mean "nothing happened".
 *
 * Ordinary `pnpm test:int` keeps its convenient skip for machines with no
 * sandbox; this is the command that may be cited as evidence.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Report = {
  numTotalTests: number
  numPassedTests: number
  numFailedTests: number
  numPendingTests: number
  numTodoTests: number
  testResults: Array<{ name: string; status: string; assertionResults: Array<{ status: string; title: string }> }>
}

const out = join(mkdtempSync(join(tmpdir(), 'readiness-required-')), 'report.json')
const run = spawnSync(
  'node_modules/.bin/vitest',
  ['run', '--config', './vitest.config.ts', '--reporter=json', `--outputFile=${out}`, 'scripts/readiness/'],
  { env: { ...process.env, READINESS_REQUIRED: '1', NODE_OPTIONS: '--no-deprecation' }, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] },
)

let report: Report
try {
  report = JSON.parse(readFileSync(out, 'utf8')) as Report
} catch {
  console.error(`vitest produced no report (exit ${run.status}).`)
  process.exit(1)
}

const integrationFiles = report.testResults.filter((file) => file.name.includes('.integration.test.'))
const integrationTests = integrationFiles.flatMap((file) => file.assertionResults)
const skipped = integrationTests.filter((test) => test.status !== 'passed' && test.status !== 'failed')
console.log(
  `\nReadiness tests: ${report.numTotalTests} total, ${report.numPassedTests} passed, ${report.numFailedTests} failed, ` +
    `${report.numPendingTests + report.numTodoTests} skipped/pending. ` +
    `Integration: ${integrationFiles.length} files, ${integrationTests.length} tests, ${skipped.length} not executed.`,
)

const problems: string[] = []
if (run.status !== 0 || report.numFailedTests > 0) problems.push('tests failed')
if (report.numPendingTests + report.numTodoTests > 0) problems.push('tests were skipped — a skip is not a pass here')
if (integrationFiles.length === 0 || integrationTests.length === 0) problems.push('no integration test ran')
if (skipped.length > 0) problems.push(`not executed: ${skipped.map((test) => test.title).join(', ')}`)
if (problems.length > 0) {
  console.error(`readiness:required refused: ${problems.join('; ')}`)
  process.exit(1)
}
