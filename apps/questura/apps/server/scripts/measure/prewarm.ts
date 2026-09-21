/**
 * Prewarm campaign landing pages before traffic arrives.
 *
 * A campaign sends its first thousand readers to the same few URLs within
 * seconds. If the page was never rendered (new deploy, recent publish,
 * evicted), every one of them waits on the same cold render and the backend
 * sees the burst at once. Requesting each URL once, a few at a time, turns
 * that into one render per URL at a moment nobody is waiting.
 *
 * Bounded on purpose: `concurrency` requests at a time and one pass per URL,
 * so a long list is a trickle, not a load test against production. Each URL
 * is fetched twice — the first renders it, the second shows whether the
 * cache now answers (`x-nextjs-cache` / `x-vercel-cache` / `cf-cache-status`).
 */

import { takeSample, type FetchLike, type Sample } from './sample'
import type { Step } from './scenario'

export type PrewarmResult = {
  url: string
  first: Pick<Sample, 'outcome' | 'status' | 'ms' | 'cacheStatus' | 'error'>
  second: Pick<Sample, 'outcome' | 'status' | 'ms' | 'cacheStatus' | 'error'>
}

const pick = (sample: Sample) => ({
  outcome: sample.outcome,
  status: sample.status,
  ms: Math.round(sample.ms),
  cacheStatus: sample.cacheStatus,
  error: sample.error,
})

export async function prewarm(
  urls: string[],
  options: { concurrency: number; timeoutMs: number; fetchImpl?: FetchLike },
): Promise<PrewarmResult[]> {
  const results: PrewarmResult[] = new Array(urls.length)
  let next = 0

  const worker = async () => {
    while (next < urls.length) {
      const index = next
      next += 1
      const url = urls[index]!
      const step: Step = { name: url, target: 'client', path: new URL(url).pathname, expect: { body: 'html' } }
      const sampleOptions = { phase: 'measure' as const, timeoutMs: options.timeoutMs, fetchImpl: options.fetchImpl }
      const first = await takeSample(url, step, sampleOptions)
      const second = await takeSample(url, step, sampleOptions)
      results[index] = { url, first: pick(first), second: pick(second) }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency, urls.length)) }, worker))
  return results
}

/** One URL per line; blank lines and `#` comments ignored; paths joined to `origin`. */
export function parseUrlList(text: string, origin: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((line) => (line.startsWith('http') ? line : `${origin.replace(/\/+$/, '')}${line.startsWith('/') ? '' : '/'}${line}`))
}
