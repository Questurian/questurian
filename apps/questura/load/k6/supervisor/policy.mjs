// The stop rules the supervisor applies, as a pure module (surge plan L08).
//
// Everything here takes explicit timestamps and returns decisions; nothing
// reads a clock, spawns a process or opens a socket. `supervise.mjs` wires it
// to k6's metric stream and to the per-instance telemetry it polls, and
// `policy.test.mjs` drives it with made-up sequences — including the ones that
// must *not* stop a run.
//
// Every stop has one reason and one exit code, so a negative control can
// assert that a run stopped *for the reason it was meant to*:
//
//   64  settings refused before anything started
//   90  rolling-window HTTP failure rate
//   91  correctness: wrong 200 body, leaked member content, false identity,
//       a private response marked cacheable, a refusal without Retry-After
//   92  sustained queue growth on an instance
//   93  telemetry missing, stale, duplicated, unknown, or an instance restarted
//   94  wall-clock or request budget spent
//   95  the load generator dropped arrivals (it could not offer the load)
//   97  a capacity run finished without its declared successful-throughput floor

export const EXIT = {
  config: 64,
  failures: 90,
  correctness: 91,
  queue: 92,
  telemetry: 93,
  budget: 94,
  generator: 95,
  floor: 97,
}

const SPECS = {
  ABORT_WINDOW_MS: { fallback: 60_000, min: 1_000, max: 3_600_000 },
  ABORT_FAILURE_RATE: { fallback: 0.01, min: 0, max: 1, fraction: true },
  ABORT_MIN_SAMPLES: { fallback: 200, min: 1, max: 1_000_000 },
  ABORT_MAX_RUN_MS: { fallback: 3 * 60 * 60 * 1000, min: 1_000, max: 24 * 60 * 60 * 1000 },
  ABORT_MAX_REQUESTS: { fallback: 5_000_000, min: 1, max: 1_000_000_000 },
  ABORT_CORRECTNESS_MAX: { fallback: 0, min: 0, max: 1_000_000 },
  ABORT_DROPPED_MAX: { fallback: 0, min: 0, max: 1_000_000 },
  ABORT_QUEUE_MIN: { fallback: 5, min: 1, max: 1_000_000 },
  ABORT_QUEUE_SUSTAIN_MS: { fallback: 10_000, min: 0, max: 600_000 },
  ABORT_TELEMETRY_GAP_MS: { fallback: 5_000, min: 250, max: 600_000 },
  ABORT_GRACE_MS: { fallback: 15_000, min: 0, max: 120_000 },
  TELEMETRY_INTERVAL_MS: { fallback: 1_000, min: 100, max: 60_000 },
  SUCCESS_FLOOR_RPS: { fallback: 0, min: 0, max: 1_000_000 },
}

const RUN_KINDS = ['correctness', 'capacity', 'containment']

/**
 * Settings from the environment, every one validated before anything starts.
 * A silent `NaN` in an abort parameter is an abort that never fires.
 */
export function readSettings(env) {
  const problems = []
  const settings = {}
  for (const [name, spec] of Object.entries(SPECS)) {
    const raw = env[name]
    if (raw === undefined || raw === '') {
      settings[name] = spec.fallback
      continue
    }
    const value = Number(raw)
    const whole = spec.fraction || Number.isInteger(value)
    if (!Number.isFinite(value) || !whole || value < spec.min || value > spec.max) {
      problems.push(`${name}=${raw} must be ${spec.fraction ? 'a number' : 'a whole number'} in [${spec.min}, ${spec.max}]`)
      continue
    }
    settings[name] = value
  }

  settings.RUN_KIND = env.RUN_KIND || 'correctness'
  if (!RUN_KINDS.includes(settings.RUN_KIND)) problems.push(`RUN_KIND must be one of ${RUN_KINDS.join(', ')}`)
  if (settings.RUN_KIND === 'capacity' && !(settings.SUCCESS_FLOOR_RPS > 0)) {
    problems.push('RUN_KIND=capacity needs SUCCESS_FLOOR_RPS > 0: a capacity claim must say how much success it requires')
  }

  settings.instances = []
  const declared = (env.TELEMETRY_INSTANCES || '').split(',').map((entry) => entry.trim()).filter(Boolean)
  for (const entry of declared) {
    const at = entry.indexOf('=')
    const id = at > 0 ? entry.slice(0, at) : ''
    const url = at > 0 ? entry.slice(at + 1) : ''
    let parsed = null
    try {
      parsed = new URL(url)
    } catch {
      // reported below
    }
    if (!id || !parsed) {
      problems.push(`TELEMETRY_INSTANCES entry "${entry}" must be <instance-id>=<db-stats URL>`)
      continue
    }
    settings.instances.push({ id, url })
  }
  const ids = settings.instances.map((instance) => instance.id)
  if (new Set(ids).size !== ids.length) problems.push('TELEMETRY_INSTANCES names an instance twice')
  if (settings.RUN_KIND !== 'correctness' && settings.instances.length === 0) {
    problems.push(`RUN_KIND=${settings.RUN_KIND} needs TELEMETRY_INSTANCES: queue growth cannot stop a run nobody is watching`)
  }

  return { settings, problems }
}

/** The depth a queue-growth rule watches: everything waiting in one process. */
export function queueDepth(sample) {
  const pool = (sample.payloadPool && sample.payloadPool.waiting) || 0
  const session = (sample.visitorAuthPool && sample.visitorAuthPool.waiting) || 0
  let gates = 0
  for (const gate of Object.values(sample.admission || {})) gates += (gate && gate.queued) || 0
  return pool + session + gates
}

export function createPolicy(settings, startedAt) {
  const state = {
    stop: null,
    window: [],
    requests: 0,
    failures: 0,
    correctness: {},
    dropped: 0,
    successes: 0,
    refusals: 0,
    lastAt: startedAt,
    instances: new Map(
      settings.instances.map((instance) => [
        instance.id,
        { id: instance.id, url: instance.url, lastSampleAt: null, startedAt: null, samples: 0, peakDepth: 0, series: [], growingSince: null },
      ]),
    ),
    seenBy: new Map(),
    events: [],
  }

  const stop = (code, reason, at) => {
    if (!state.stop) state.stop = { code, reason, at }
    return state.stop
  }

  return {
    state,

    /** One finished HTTP request. `failed` is k6's http_req_failed. */
    http(at, failed, status) {
      state.lastAt = Math.max(state.lastAt, at)
      state.requests += 1
      if (failed) state.failures += 1
      if (status === 429 || status === 503) state.refusals += 1
      else if (!failed) state.successes += 1

      if (state.requests > settings.ABORT_MAX_REQUESTS) {
        return stop(EXIT.budget, `request budget of ${settings.ABORT_MAX_REQUESTS} spent`, at)
      }

      state.window.push([at, failed ? 1 : 0])
      const cutoff = at - settings.ABORT_WINDOW_MS
      while (state.window.length && state.window[0][0] < cutoff) state.window.shift()
      // A containment run expects refusals; its HTTP failures are reported,
      // not a reason to stop. Correctness and resource rules still apply.
      if (settings.RUN_KIND === 'containment') return state.stop
      if (state.window.length < settings.ABORT_MIN_SAMPLES) return state.stop
      const failures = state.window.reduce((total, entry) => total + entry[1], 0)
      const rate = failures / state.window.length
      if (rate > settings.ABORT_FAILURE_RATE) {
        return stop(
          EXIT.failures,
          `failure rate ${(rate * 100).toFixed(2)}% over the last ${settings.ABORT_WINDOW_MS / 1000}s (${failures}/${state.window.length}) exceeds ${(settings.ABORT_FAILURE_RATE * 100).toFixed(2)}%`,
          at,
        )
      }
      return state.stop
    },

    /** A correctness failure emitted by the scenario, by class. Never averaged away. */
    correctness(at, kind, count = 1) {
      state.correctness[kind] = (state.correctness[kind] || 0) + count
      const total = Object.values(state.correctness).reduce((sum, value) => sum + value, 0)
      if (total > settings.ABORT_CORRECTNESS_MAX) {
        return stop(EXIT.correctness, `correctness failure: ${kind} (${total} in total)`, at)
      }
      return state.stop
    },

    /** k6's dropped_iterations: arrivals the generator could not start. */
    dropped(at, count) {
      state.dropped += count
      if (settings.RUN_KIND !== 'correctness' && state.dropped > settings.ABORT_DROPPED_MAX) {
        return stop(EXIT.generator, `the load generator dropped ${state.dropped} arrivals; the offered load was not the declared load`, at)
      }
      return state.stop
    },

    /**
     * One telemetry sample fetched from `endpoint` (the declared instance id
     * that URL belongs to). Validity first: an answer from an instance we did
     * not ask, the same instance behind two endpoints, a stale sample or a
     * restart all make the evidence unusable.
     */
    sample(at, endpoint, sample) {
      const instance = state.instances.get(endpoint)
      if (!instance) return stop(EXIT.telemetry, `telemetry from an undeclared endpoint ${endpoint}`, at)
      const reported = sample && sample.instance && sample.instance.id
      if (!reported) return stop(EXIT.telemetry, `telemetry from ${endpoint} carries no instance id`, at)
      if (reported !== endpoint) {
        return stop(EXIT.telemetry, `${endpoint} answered as ${reported}: a balancer or a stranger is in the path`, at)
      }
      const other = state.seenBy.get(reported)
      if (other && other !== endpoint) return stop(EXIT.telemetry, `instance ${reported} answered two endpoints`, at)
      state.seenBy.set(reported, endpoint)

      const takenAt = Date.parse(sample.takenAt || '')
      if (!Number.isFinite(takenAt) || at - takenAt > settings.ABORT_TELEMETRY_GAP_MS) {
        return stop(EXIT.telemetry, `stale telemetry from ${endpoint} (taken ${sample.takenAt || 'never'})`, at)
      }
      const started = sample.instance.startedAt || null
      if (instance.startedAt && started && started !== instance.startedAt) {
        return stop(EXIT.telemetry, `instance ${endpoint} restarted during the run`, at)
      }
      instance.startedAt = started
      instance.lastSampleAt = at
      instance.samples += 1

      const depth = queueDepth(sample)
      instance.peakDepth = Math.max(instance.peakDepth, depth)
      // A queue that drains to zero is a queue that is not growing: forget
      // its history, so a later burst is judged on its own.
      if (depth === 0) {
        instance.series = []
        instance.growingSince = null
        return state.stop
      }
      instance.series.push([at, depth])
      const cutoff = at - settings.ABORT_WINDOW_MS
      while (instance.series.length && instance.series[0][0] < cutoff) instance.series.shift()

      const first = instance.series[0][1]
      const rising = instance.series.length >= 3 && depth >= settings.ABORT_QUEUE_MIN && depth > first
      const nonDecreasing = instance.series.every((point, index) => index === 0 || point[1] >= instance.series[index - 1][1])
      if (rising && nonDecreasing) {
        instance.growingSince = instance.growingSince ?? instance.series[0][0]
        if (at - instance.growingSince >= settings.ABORT_QUEUE_SUSTAIN_MS) {
          return stop(
            EXIT.queue,
            `queue on ${endpoint} grew from ${first} to ${depth} over ${Math.round((at - instance.growingSince) / 1000)}s without draining`,
            at,
          )
        }
      } else {
        instance.growingSince = null
      }
      return state.stop
    },

    /** Called on a timer: budgets and missing telemetry. */
    tick(at) {
      if (at - startedAt > settings.ABORT_MAX_RUN_MS) {
        return stop(EXIT.budget, `wall clock exceeded ${settings.ABORT_MAX_RUN_MS / 1000}s`, at)
      }
      for (const instance of state.instances.values()) {
        const since = instance.lastSampleAt ?? startedAt
        // The first sample gets twice the gap: the run is still starting.
        const allowed = instance.lastSampleAt === null ? settings.ABORT_TELEMETRY_GAP_MS * 2 : settings.ABORT_TELEMETRY_GAP_MS
        if (at - since > allowed) {
          return stop(EXIT.telemetry, `no telemetry from ${instance.id} for ${Math.round((at - since) / 1000)}s`, at)
        }
      }
      return state.stop
    },

    /** At the end: does a capacity claim have the success it declared? */
    finish(at) {
      if (state.stop) return state.stop
      if (settings.RUN_KIND === 'capacity') {
        const seconds = Math.max(1, (at - startedAt) / 1000)
        const successRps = state.successes / seconds
        if (successRps < settings.SUCCESS_FLOOR_RPS) {
          return stop(
            EXIT.floor,
            `successful throughput ${successRps.toFixed(1)}/s is below the declared floor ${settings.SUCCESS_FLOOR_RPS}/s ` +
              `(${state.successes} successes, ${state.refusals} refusals of ${state.requests})`,
            at,
          )
        }
      }
      return null
    },

    summary(at) {
      const seconds = Math.max(0.001, (at - startedAt) / 1000)
      return {
        runKind: settings.RUN_KIND,
        durationS: Number(seconds.toFixed(1)),
        stop: state.stop,
        requests: state.requests,
        successes: state.successes,
        refusals: state.refusals,
        failures: state.failures,
        successRps: Number((state.successes / seconds).toFixed(2)),
        successFraction: state.requests ? Number((state.successes / state.requests).toFixed(4)) : null,
        refusalFraction: state.requests ? Number((state.refusals / state.requests).toFixed(4)) : null,
        correctness: state.correctness,
        dropped: state.dropped,
        instances: [...state.instances.values()].map((instance) => ({
          id: instance.id,
          samples: instance.samples,
          peakQueueDepth: instance.peakDepth,
          startedAt: instance.startedAt,
        })),
      }
    },
  }
}
