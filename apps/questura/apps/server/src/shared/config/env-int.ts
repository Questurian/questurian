type Env = Record<string, string | undefined>

/**
 * One parser for every count and size a deployment declares.
 *
 * `null` value with no problem means "not set". Anything else is a whole
 * number inside `[min, max]` or a problem naming the variable — never a
 * silent fallback, because the operator believes the number they set. The
 * value is never echoed when it looks like more than a number, so a URI that
 * lands in the wrong variable is not copied into a boot log.
 */
export type IntRead = { value: number | null; problem: string | null }

export function readBoundedInt(env: Env, name: string, min: number, max: number): IntRead {
  const raw = env[name]?.trim()
  if (!raw) return { value: null, problem: null }

  if (!/^\d+$/.test(raw)) {
    const shown = raw.length <= 24 && !/[:/@]/.test(raw) ? `"${raw}"` : 'a value that is not a number'
    return { value: null, problem: `${name} must be a whole number, got ${shown}.` }
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    return { value: null, problem: `${name} must be between ${min} and ${max}, got ${raw}.` }
  }
  return { value, problem: null }
}
