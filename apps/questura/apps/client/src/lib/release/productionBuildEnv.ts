/**
 * What a production build of the site must be given, checked before Next
 * starts compiling (`next.config.ts`).
 *
 * `NEXT_PUBLIC_*` values are written into the site's JavaScript when it is
 * built. Setting them later on the host changes nothing. A build that runs
 * without them does not fail on its own: the API address falls back to
 * `http://localhost:4000` (`lib/api/api-config.ts`), so every visitor's
 * sign-in, bookmark and Subscribe button would call their own computer. The
 * setup checklist built in a fresh worktree, which has no `.env` files, so
 * that is exactly what it would have shipped.
 *
 * The readiness sandbox builds with loopback addresses on purpose, and says
 * so with `QUESTURA_BUILD_TARGET=readiness`. Nothing else skips the check.
 *
 * Messages are written for whoever runs the build, who may not be a
 * developer: what is wrong, why it matters, what to do.
 */

type Env = Record<string, string | undefined>

export const BUILD_TARGET_VARIABLE = 'QUESTURA_BUILD_TARGET'
export const SANDBOX_BUILD_TARGET = 'readiness'

const LOOPBACK_HOST = /^(localhost|.+\.localhost|127(\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)$/i

function urlProblem(name: string, raw: string, example: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return `${name} is "${raw}", which is not a web address. It should look like ${example}.`
  }
  if (LOOPBACK_HOST.test(url.hostname)) {
    return `${name} is ${raw}, an address on the computer doing the build. Visitors cannot reach it. It should look like ${example}.`
  }
  if (url.protocol !== 'https:') {
    return `${name} is ${raw}. It must start with https:// (for example ${example}).`
  }
  return null
}

export function productionBuildProblems(env: Env): string[] {
  const target = env[BUILD_TARGET_VARIABLE]?.trim() ?? ''
  if (target === SANDBOX_BUILD_TARGET) return []
  if (target && target !== 'production') {
    return [
      `${BUILD_TARGET_VARIABLE} is "${target}". Leave it unset for a real build; ` +
        `"${SANDBOX_BUILD_TARGET}" is only for the local readiness sandbox.`,
    ]
  }

  const problems: string[] = []
  const value = (name: string) => env[name]?.trim() ?? ''

  const backend = value('NEXT_PUBLIC_BACKEND_URL')
  if (!backend) {
    problems.push(
      'NEXT_PUBLIC_BACKEND_URL is not set. It is the API address (for example https://api.questurian.com). ' +
        'Without it the site would call http://localhost:4000, and sign-in, bookmarks and Subscribe would fail for every visitor.',
    )
  } else {
    const problem = urlProblem('NEXT_PUBLIC_BACKEND_URL', backend, 'https://api.questurian.com')
    if (problem) problems.push(problem)
  }

  // `lib/seo/publicBaseUrl.ts` reads the frontend URL first, then the app URL.
  const siteNames = ['NEXT_PUBLIC_FRONTEND_URL', 'NEXT_PUBLIC_APP_URL'] as const
  const setSiteNames = siteNames.filter((name) => value(name))
  if (setSiteNames.length === 0) {
    problems.push(
      'NEXT_PUBLIC_APP_URL (or NEXT_PUBLIC_FRONTEND_URL) is not set. It is the site address (for example https://www.questurian.com), ' +
        'used for links, sharing and the addresses search engines are told to index.',
    )
  }
  for (const name of setSiteNames) {
    const problem = urlProblem(name, value(name), 'https://www.questurian.com')
    if (problem) problems.push(problem)
  }

  const publishable = value('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY')
  if (!publishable) {
    problems.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. Use the live publishable key (it starts with pk_live_).')
  } else if (/^pk_test_/.test(publishable)) {
    problems.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a test-mode key (pk_test_). The site takes real payments: use the pk_live_ key.')
  } else if (!/^pk_live_[A-Za-z0-9]{16,}$/.test(publishable)) {
    problems.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY does not look like a live publishable key (pk_live_ followed by letters and digits). It may still be a placeholder.')
  }

  return problems
}

export function assertProductionBuildEnv(env: Env): void {
  const problems = productionBuildProblems(env)
  if (problems.length === 0) return
  throw new Error(
    [
      'The site build stopped before it started: these settings are written into the site when it is built, and they are missing or wrong.',
      '',
      ...problems.map((problem) => `  - ${problem}`),
      '',
      'Set them in the environment of the build command and run it again (docs/capacity/h01-provisioning-checklist.md, step 19).',
      `For a local readiness sandbox build only, set ${BUILD_TARGET_VARIABLE}=${SANDBOX_BUILD_TARGET}.`,
    ].join('\n'),
  )
}
