/**
 * Prewarm campaign landing pages. See scripts/measure/prewarm.ts.
 *
 *   pnpm prewarm:campaign -- --client https://www.questurian.com --urls ../../docs/capacity/campaign-urls.txt
 *   pnpm prewarm:campaign -- --client http://localhost:3100 --urls ../../docs/capacity/campaign-urls.txt --concurrency 2
 *
 * Exit code 2 if any URL failed to render successfully.
 */

import { readFileSync } from 'node:fs'

import { parseUrlList, prewarm } from './measure/prewarm'

function flag(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (value === undefined && fallback === undefined) throw new Error(`--${name} is required`)
  return value ?? fallback!
}

async function main() {
  const client = new URL(flag('client')).origin
  const urls = parseUrlList(readFileSync(flag('urls'), 'utf8'), client)
  const concurrency = Number(flag('concurrency', '2'))
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error('--concurrency must be a whole number from 1 to 8')
  }

  const results = await prewarm(urls, { concurrency, timeoutMs: 60_000 })
  for (const result of results) {
    console.log(
      `${result.first.outcome === 'ok' ? 'ok  ' : 'FAIL'} ${String(result.first.status ?? '-').padStart(3)} ` +
        `${String(result.first.ms).padStart(6)} ms → ${String(result.second.ms).padStart(5)} ms ` +
        `cache ${result.second.cacheStatus ?? 'unreported'}  ${result.url}` +
        (result.first.error ? `  (${result.first.error})` : ''),
    )
  }

  if (results.some((result) => result.first.outcome !== 'ok')) process.exit(2)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
