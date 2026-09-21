/**
 * What a load run asks for, written down as data.
 *
 * A scenario is a list of iterations. In closed mode every request of every
 * iteration is measured in turn; in arrival mode one iteration is started per
 * arrival, picked by weight, and its requests run in order with think time
 * between them — one reader's visit. Each request says what a *correct*
 * response looks like, so a 200 that is really a login page, an empty list or
 * a throttle notice is not counted as the content the run meant to exercise.
 */

export type Target = 'server' | 'client'

export type Expectation = {
  /** Statuses that count as the intended content. Default `[200]`. */
  status?: number[]
  /** `json` requires a parseable JSON body; `html` requires `<html`. */
  body?: 'json' | 'html' | 'any'
  /** Smallest body that can be the real thing; catches empty shells. */
  minBytes?: number
  /** Substring that must appear in the body. */
  contains?: string
}

export type Step = {
  name: string
  target: Target
  path: string
  expect?: Expectation
  /** Pause after this step, before the next one in the same iteration. */
  thinkMs?: number
  /** Extra request headers, e.g. a synthetic cookie for identity scenarios. */
  headers?: Record<string, string>
}

export type Iteration = {
  name: string
  /** Relative frequency in arrival mode. Default 1. */
  weight?: number
  steps: Step[]
}

export type Scenario = {
  name: string
  description: string
  iterations: Iteration[]
}

export class ScenarioError extends Error {}

export function validateScenario(value: unknown, source: string): Scenario {
  const fail = (message: string): never => {
    throw new ScenarioError(`${source}: ${message}`)
  }

  if (!value || typeof value !== 'object') fail('must be a JSON object')
  const scenario = value as Scenario

  if (typeof scenario.name !== 'string' || !scenario.name) fail('needs a name')
  if (!Array.isArray(scenario.iterations) || scenario.iterations.length === 0) {
    fail('needs at least one iteration')
  }

  for (const iteration of scenario.iterations) {
    if (!iteration.name) fail('every iteration needs a name')
    if (iteration.weight !== undefined && !(iteration.weight > 0)) {
      fail(`iteration "${iteration.name}" has a non-positive weight`)
    }
    if (!Array.isArray(iteration.steps) || iteration.steps.length === 0) {
      fail(`iteration "${iteration.name}" has no steps`)
    }
    for (const step of iteration.steps) {
      if (step.target !== 'server' && step.target !== 'client') {
        fail(`step "${step.name}" must target "server" or "client"`)
      }
      if (typeof step.path !== 'string' || !step.path.startsWith('/')) {
        fail(`step "${step.name}" needs a path starting with "/"`)
      }
      if (step.thinkMs !== undefined && !(step.thinkMs >= 0)) {
        fail(`step "${step.name}" has a negative thinkMs`)
      }
    }
  }

  return scenario
}

/**
 * Pick an iteration by weight. `random` is injectable so a test can pin it.
 */
export function pickIteration(scenario: Scenario, random: () => number = Math.random): Iteration {
  const total = scenario.iterations.reduce((sum, entry) => sum + (entry.weight ?? 1), 0)
  let point = random() * total

  for (const iteration of scenario.iterations) {
    point -= iteration.weight ?? 1
    if (point < 0) return iteration
  }
  return scenario.iterations[scenario.iterations.length - 1]!
}

/** Scenario header values may say `{origin}`; see `HarnessArgs.origin`. */
export function stepHeaders(step: Step, values: { origin: string }): Record<string, string> {
  return Object.fromEntries(
    Object.entries(step.headers ?? {}).map(([name, value]) => [name, value.replaceAll('{origin}', values.origin)]),
  )
}

export function stepUrl(step: Step, origins: { base: string; client: string }): string {
  return `${step.target === 'server' ? origins.base : origins.client}${step.path}`
}
