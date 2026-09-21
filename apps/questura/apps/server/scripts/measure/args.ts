/**
 * Command-line arguments for the load harness, validated up front.
 *
 * The old script coerced whatever it was given: `--runs abc` became `NaN`,
 * `Math.max(2, NaN)` is `NaN`, and the loop silently ran zero times and printed
 * a table of zeros. A measurement that quietly measures nothing is worse than
 * one that refuses to start, so every numeric flag is a bounded integer and a
 * bad one is an error that names the flag.
 */

export type Mode = 'closed' | 'arrival'
export type CacheState = 'warm' | 'cold'

export type HarnessArgs = {
  /** Backend origin, e.g. `http://localhost:4000`. */
  base: string
  /** Frontend origin, for scenario steps that target the client. */
  client: string
  /**
   * Value substituted for `{origin}` in scenario headers: the origin a browser
   * would send. Cookie-bearing API calls are refused without an allowed one.
   * Defaults to `client`.
   */
  origin: string
  /** Scenario name: a file under `scripts/measure/scenarios/`. */
  scenario: string
  mode: Mode
  cache: CacheState
  /** Closed mode: measured rounds per request. */
  runs: number
  /** Closed mode: requests fired together per round. */
  concurrent: number
  /** Unmeasured requests per request before measuring. Forced to 0 for `cold`. */
  warmup: number
  /** Per-request deadline. A request still open after this is a timeout. */
  timeoutMs: number
  /** Arrival mode: iterations started per second, regardless of how the server copes. */
  rate: number
  /** Arrival mode: seconds to keep offering load. */
  durationS: number
  /**
   * Arrival mode: most iterations allowed in flight at once. An arrival that
   * finds the cap reached is dropped and counted, never silently delayed —
   * delaying it is exactly how a closed loop hides overload.
   */
  maxInFlight: number
  /**
   * Abort the run once this fraction of completed requests has failed
   * (evaluated after `abortMinSamples`). 1 disables.
   */
  abortErrorRate: number
  abortMinSamples: number
  jsonPath: string
  htmlPath: string
  /** Free-text note stored in the evidence file (dataset, build, anything). */
  label: string
}

type IntBounds = { min: number; max: number }

const DEFAULTS = {
  base: 'http://localhost:4000',
  client: 'http://localhost:3000',
  scenario: 'public-api',
  mode: 'closed',
  cache: 'warm',
  runs: 10,
  concurrent: 1,
  warmup: 1,
  timeoutMs: 15_000,
  rate: 5,
  durationS: 30,
  maxInFlight: 200,
  abortErrorRate: 1,
  abortMinSamples: 50,
} as const

const BOUNDS: Record<string, IntBounds> = {
  runs: { min: 1, max: 10_000 },
  concurrent: { min: 1, max: 500 },
  warmup: { min: 0, max: 1_000 },
  'timeout-ms': { min: 100, max: 120_000 },
  rate: { min: 1, max: 5_000 },
  duration: { min: 1, max: 7_200 },
  'max-in-flight': { min: 1, max: 20_000 },
  'abort-min-samples': { min: 1, max: 1_000_000 },
}

export class ArgumentError extends Error {}

function readFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!
    if (token === '--') continue
    if (!token.startsWith('--')) {
      throw new ArgumentError(`Unexpected argument "${token}". Flags look like --name value.`)
    }

    const name = token.slice(2)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new ArgumentError(`--${name} needs a value.`)
    }
    flags.set(name, value)
    index += 1
  }

  return flags
}

function boundedInt(flags: Map<string, string>, name: string, fallback: number): number {
  const raw = flags.get(name)
  if (raw === undefined) return fallback

  const bounds = BOUNDS[name]!
  if (!/^\d+$/.test(raw)) {
    throw new ArgumentError(`--${name} must be a whole number, got "${raw}".`)
  }

  const value = Number(raw)
  if (value < bounds.min || value > bounds.max) {
    throw new ArgumentError(`--${name} must be between ${bounds.min} and ${bounds.max}, got ${value}.`)
  }
  return value
}

function origin(raw: string, name: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ArgumentError(`--${name} must be an absolute http(s) URL, got "${raw}".`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ArgumentError(`--${name} must be http or https, got "${url.protocol}".`)
  }
  return url.origin
}

function oneOf<T extends string>(raw: string, allowed: readonly T[], name: string): T {
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ArgumentError(`--${name} must be one of ${allowed.join(', ')}, got "${raw}".`)
  }
  return raw as T
}

const KNOWN = new Set([
  'base',
  'client',
  'origin',
  'scenario',
  'mode',
  'cache',
  'json',
  'html',
  'label',
  'abort-error-rate',
  ...Object.keys(BOUNDS),
])

export function parseArgs(argv: string[]): HarnessArgs {
  const flags = readFlags(argv)

  for (const name of flags.keys()) {
    if (!KNOWN.has(name)) throw new ArgumentError(`Unknown flag --${name}.`)
  }

  const scenario = flags.get('scenario') ?? DEFAULTS.scenario
  if (!/^[a-z0-9-]+$/.test(scenario)) {
    throw new ArgumentError(`--scenario must be a scenario file name like "public-api", got "${scenario}".`)
  }

  const cache = oneOf(flags.get('cache') ?? DEFAULTS.cache, ['warm', 'cold'] as const, 'cache')

  const abortRaw = flags.get('abort-error-rate')
  let abortErrorRate: number = DEFAULTS.abortErrorRate
  if (abortRaw !== undefined) {
    abortErrorRate = Number(abortRaw)
    if (!Number.isFinite(abortErrorRate) || abortErrorRate <= 0 || abortErrorRate > 1) {
      throw new ArgumentError(`--abort-error-rate must be a fraction in (0, 1], got "${abortRaw}".`)
    }
  }

  const warmup = boundedInt(flags, 'warmup', DEFAULTS.warmup)
  if (cache === 'cold' && flags.has('warmup') && warmup > 0) {
    throw new ArgumentError('--cache cold measures first requests; it cannot also take --warmup.')
  }

  const client = origin(flags.get('client') ?? DEFAULTS.client, 'client')

  return {
    base: origin(flags.get('base') ?? DEFAULTS.base, 'base'),
    client,
    origin: flags.has('origin') ? origin(flags.get('origin')!, 'origin') : client,
    scenario,
    mode: oneOf(flags.get('mode') ?? DEFAULTS.mode, ['closed', 'arrival'] as const, 'mode'),
    cache,
    runs: boundedInt(flags, 'runs', DEFAULTS.runs),
    concurrent: boundedInt(flags, 'concurrent', DEFAULTS.concurrent),
    warmup: cache === 'cold' ? 0 : warmup,
    timeoutMs: boundedInt(flags, 'timeout-ms', DEFAULTS.timeoutMs),
    rate: boundedInt(flags, 'rate', DEFAULTS.rate),
    durationS: boundedInt(flags, 'duration', DEFAULTS.durationS),
    maxInFlight: boundedInt(flags, 'max-in-flight', DEFAULTS.maxInFlight),
    abortErrorRate,
    abortMinSamples: boundedInt(flags, 'abort-min-samples', DEFAULTS.abortMinSamples),
    jsonPath: flags.get('json') ?? '',
    htmlPath: flags.get('html') ?? '',
    label: flags.get('label') ?? '',
  }
}
