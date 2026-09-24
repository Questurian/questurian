import assert from 'node:assert/strict'
import test from 'node:test'

import { assertProductionBuildEnv, productionBuildProblems } from './productionBuildEnv.ts'

// The API address and site address are baked into the JavaScript when the
// site is built. A build that is not given them ships `http://localhost:4000`
// to every visitor, and nothing fails until people try to sign in.
const LIVE_KEY = `pk_live_${'A1b2C3d4'.repeat(6)}`
const GOOD = {
  NEXT_PUBLIC_BACKEND_URL: 'https://api.questurian.com',
  NEXT_PUBLIC_APP_URL: 'https://www.questurian.com',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: LIVE_KEY,
}

const without = (name) => {
  const env = { ...GOOD }
  delete env[name]
  return env
}

test('a build given real addresses and a live key passes', () => {
  assert.deepEqual(productionBuildProblems(GOOD), [])
  assert.deepEqual(productionBuildProblems({ ...without('NEXT_PUBLIC_APP_URL'), NEXT_PUBLIC_FRONTEND_URL: 'https://www.questurian.com' }), [])
  assert.doesNotThrow(() => assertProductionBuildEnv(GOOD))
})

test('an empty environment fails and names every missing variable', () => {
  const problems = productionBuildProblems({})
  assert.equal(problems.length, 3)
  assert.match(problems[0], /^NEXT_PUBLIC_BACKEND_URL is not set/)
  assert.match(problems[1], /^NEXT_PUBLIC_APP_URL \(or NEXT_PUBLIC_FRONTEND_URL\) is not set/)
  assert.match(problems[2], /^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set/)
  assert.throws(() => assertProductionBuildEnv({}), /The site build stopped[\s\S]*NEXT_PUBLIC_BACKEND_URL is not set[\s\S]*step 19/)
})

test('each address must be https and not on the build machine', () => {
  for (const [name, value, pattern] of [
    ['NEXT_PUBLIC_BACKEND_URL', 'http://localhost:4000', /computer doing the build/],
    ['NEXT_PUBLIC_BACKEND_URL', 'http://127.0.0.1:4100', /computer doing the build/],
    ['NEXT_PUBLIC_BACKEND_URL', 'http://api.readiness.localhost:4100', /computer doing the build/],
    ['NEXT_PUBLIC_BACKEND_URL', 'http://api.questurian.com', /must start with https/],
    ['NEXT_PUBLIC_BACKEND_URL', 'api.questurian.com', /not a web address/],
    ['NEXT_PUBLIC_APP_URL', 'http://localhost:3000', /computer doing the build/],
    ['NEXT_PUBLIC_FRONTEND_URL', 'http://www.questurian.com', /must start with https/],
  ]) {
    const problems = productionBuildProblems({ ...GOOD, [name]: value })
    assert.equal(problems.length, 1, `${name}=${value}`)
    assert.ok(problems[0].startsWith(name), problems[0])
    assert.match(problems[0], pattern)
  }
})

test('the Stripe key must be a live publishable key, not a test key or a placeholder', () => {
  assert.match(productionBuildProblems({ ...GOOD, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_test_${'x'.repeat(40)}` })[0], /test-mode/)
  assert.match(productionBuildProblems({ ...GOOD, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_YOUR_KEY_HERE' })[0], /placeholder/)
  assert.match(productionBuildProblems({ ...GOOD, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `sk_live_${'x'.repeat(40)}` })[0], /does not look like/)
})

test('only the readiness sandbox may skip the check, and only by name', () => {
  assert.deepEqual(productionBuildProblems({ QUESTURA_BUILD_TARGET: 'readiness' }), [])
  assert.deepEqual(productionBuildProblems({ ...GOOD, QUESTURA_BUILD_TARGET: 'production' }), [])
  const typo = productionBuildProblems({ ...GOOD, QUESTURA_BUILD_TARGET: 'sandbox' })
  assert.equal(typo.length, 1)
  assert.match(typo[0], /QUESTURA_BUILD_TARGET is "sandbox"/)
})
