/**
 * Samples `/api/internal/db-stats` while a run is in progress.
 *
 * Latency says a request was slow; pool occupancy says why. `waiting > 0`
 * means requests queued for a connection rather than for the database. The
 * route only reports the process that answers it, so behind several
 * instances this is one instance's view — the report says so.
 */

export type PoolSeries = {
  samples: number
  failedSamples: number
  maxWaiting: number
  maxTotal: number
  /** Seconds since start, waiting count — enough to see whether a queue drains. */
  waitingSeries: Array<[number, number]>
  scope: 'single-process'
}

export function startPoolSampler(
  base: string,
  secret: string,
  intervalMs = 1000,
): { stop: () => Promise<PoolSeries> } {
  const series: PoolSeries = {
    samples: 0,
    failedSamples: 0,
    maxWaiting: 0,
    maxTotal: 0,
    waitingSeries: [],
    scope: 'single-process',
  }
  const startedAt = performance.now()
  let inFlight: Promise<void> = Promise.resolve()

  const tick = () => {
    inFlight = (async () => {
      try {
        const response = await fetch(`${base}/api/internal/db-stats`, {
          headers: { authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(Math.max(500, intervalMs)),
        })
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as { payloadPool?: { waiting?: number; total?: number } }
        const waiting = body.payloadPool?.waiting ?? 0
        const total = body.payloadPool?.total ?? 0
        series.samples += 1
        series.maxWaiting = Math.max(series.maxWaiting, waiting)
        series.maxTotal = Math.max(series.maxTotal, total)
        series.waitingSeries.push([Math.round((performance.now() - startedAt) / 100) / 10, waiting])
      } catch {
        series.failedSamples += 1
      }
    })()
  }

  const timer = setInterval(tick, intervalMs)
  tick()

  return {
    stop: async () => {
      clearInterval(timer)
      await inFlight
      return series
    },
  }
}
