import type { HarnessArgs } from './args'
import type { PoolSeries } from './pool-sampler'
import type { StepSummary, Throughput } from './stats'
import { OUTCOMES } from './stats'

export type Evidence = {
  meta: Record<string, string | number | boolean | null>
  args: HarnessArgs
  throughput: Throughput
  steps: StepSummary[]
  pool: PoolSeries | null
  aborted: string | null
}

const round = (value: number | null) => (value === null ? '-' : String(Math.round(value * 10) / 10))

export function textReport(evidence: Evidence): string {
  const lines: string[] = []
  const header =
    'step'.padEnd(22) +
    'n'.padStart(6) +
    'ok'.padStart(6) +
    'fail%'.padStart(7) +
    'p50'.padStart(8) +
    'p95'.padStart(8) +
    'p99'.padStart(8) +
    'stmts'.padStart(7) +
    'reads'.padStart(6) +
    'poolw'.padStart(7) +
    'bytes'.padStart(9)
  lines.push(header, '-'.repeat(header.length))

  for (const step of evidence.steps) {
    lines.push(
      step.step.slice(0, 21).padEnd(22) +
        String(step.measured).padStart(6) +
        String(step.outcomes.ok).padStart(6) +
        (step.failureRate * 100).toFixed(1).padStart(7) +
        round(step.okLatency.p50).padStart(8) +
        round(step.okLatency.p95).padStart(8) +
        round(step.okLatency.p99).padStart(8) +
        round(step.statements.median).padStart(7) +
        round(step.reads.median).padStart(6) +
        round(step.poolWaitMs.max).padStart(7) +
        round(step.bytes.median).padStart(9),
    )
    const failures = OUTCOMES.filter((outcome) => outcome !== 'ok' && step.outcomes[outcome] > 0)
    if (failures.length > 0) {
      lines.push(`  failures: ${failures.map((outcome) => `${outcome}=${step.outcomes[outcome]}`).join(' ')}`)
    }
  }

  const t = evidence.throughput
  lines.push(
    '',
    `offered ${t.offered} (${t.offeredPerS.toFixed(1)}/s)  started ${t.started}  dropped ${t.dropped}`,
    `completed ${t.completedRequests} requests (${t.completedPerS.toFixed(1)}/s), ok ${t.okRequests} (${t.okPerS.toFixed(1)}/s) over ${t.elapsedS.toFixed(1)} s`,
    `generator lateness p95 ${round(t.lateness.p95)} ms${t.generatorSaturated ? '  ** GENERATOR SATURATED: server was offered less than scheduled **' : ''}`,
  )

  if (evidence.pool) {
    lines.push(
      `pool: max waiting ${evidence.pool.maxWaiting}, max total ${evidence.pool.maxTotal} over ${evidence.pool.samples} samples`,
    )
  } else {
    lines.push('pool: unavailable (set DB_STATS_SECRET to sample /api/internal/db-stats)')
  }

  if (evidence.aborted) lines.push('', `ABORTED: ${evidence.aborted}`)

  lines.push(
    '',
    'Latency columns are successful responses only; every other outcome is counted under failures.',
    'A "-" means the server did not report that number (diagnostics off, or not applicable) — never zero.',
    'Milliseconds describe this machine and dataset. Statement and read counts describe the code.',
  )
  return lines.join('\n')
}

const escape = (value: unknown) =>
  String(value ?? '—').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)

export function htmlReport(evidence: Evidence): string {
  const rows = evidence.steps
    .map(
      (step) => `<tr>
        <td>${escape(step.step)}</td>
        <td class="n">${step.measured}</td>
        <td class="n">${step.outcomes.ok}</td>
        <td class="n">${(step.failureRate * 100).toFixed(1)}</td>
        <td class="n">${round(step.okLatency.p50)}</td>
        <td class="n">${round(step.okLatency.p95)}</td>
        <td class="n">${round(step.okLatency.p99)}</td>
        <td class="n">${round(step.statements.median)}</td>
        <td class="n">${round(step.reads.median)}</td>
        <td class="n">${round(step.bytes.median)}</td>
        <td><code>${escape(step.cacheControl)}</code></td>
      </tr>`,
    )
    .join('\n')

  const meta = Object.entries({ ...evidence.meta, aborted: evidence.aborted })
    .map(([key, value]) => `<tr><td>${escape(key)}</td><td><code>${escape(value)}</code></td></tr>`)
    .join('\n')

  const t = evidence.throughput

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Questura load run</title>
<style>
  :root { color-scheme: light dark; --ink:#1a1a1a; --paper:#fff; --rule:#d8d8d8; --dim:#666; }
  @media (prefers-color-scheme: dark) { :root { --ink:#e8e8e8; --paper:#151515; --rule:#333; --dim:#999; } }
  body { font: 15px/1.55 ui-sans-serif, system-ui, sans-serif; color: var(--ink); background: var(--paper); margin: 0; padding: 32px 16px; }
  main { max-width: 1000px; margin: 0 auto; }
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 28px; font-size: 14px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--rule); }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  code { font-size: 12px; } .note { color: var(--dim); font-size: 13px; }
</style></head>
<body><main>
<h1>Questura load run</h1>
<p class="note">${escape(evidence.meta.takenAt)} · ${escape(evidence.args.mode)} · ${escape(evidence.args.scenario)} · cache ${escape(evidence.args.cache)}</p>
<div class="wrap"><table>
  <thead><tr><th>step</th><th class="n">n</th><th class="n">ok</th><th class="n">fail %</th><th class="n">p50</th><th class="n">p95</th><th class="n">p99</th><th class="n">stmts</th><th class="n">reads</th><th class="n">bytes</th><th>cache-control</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<p>Offered ${t.offered} (${t.offeredPerS.toFixed(1)}/s), started ${t.started}, dropped ${t.dropped}. Completed ${t.completedRequests} requests, ${t.okRequests} ok (${t.okPerS.toFixed(1)}/s). Generator lateness p95 ${round(t.lateness.p95)} ms${t.generatorSaturated ? ' — generator saturated' : ''}.</p>
<div class="wrap"><table><tbody>${meta}</tbody></table></div>
<p class="note">Latency is successful responses only. “-” means the server did not report the number, never zero.</p>
</main></body></html>`
}
