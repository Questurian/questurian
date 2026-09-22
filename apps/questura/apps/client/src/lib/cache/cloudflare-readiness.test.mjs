import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const pkg = JSON.parse(readFileSync(resolve(clientRoot, 'package.json'), 'utf8'))

/**
 * The adapter plan in `cloudflare/README.md` was written against one Next
 * release and one set of adapter requirements. A Next upgrade is exactly the
 * change that would invalidate it silently — the plan would still read
 * plausibly and no longer be true.
 */
test('the adapter plan still matches the Next release it was written against', () => {
  assert.equal(
    pkg.dependencies.next,
    '15.4.11',
    'Next moved. Re-check apps/client/cloudflare/README.md against the adapter docs before trusting it.',
  )
})

// If this starts failing, the install happened: delete this test and replace
// it with one that exercises the real build.
test('the adapter is still not installed, so nothing here may claim it works', () => {
  const declared = { ...pkg.dependencies, ...pkg.devDependencies }
  assert.equal(
    declared['@opennextjs/cloudflare'],
    undefined,
    'The adapter is installed. L09 is no longer "blocked on tooling" — build the Worker and record real evidence.',
  )
})

// Templates, deliberately not live configuration: a wrangler.jsonc at the
// client root would be read by tooling and would claim a setup that does not
// exist.
test('the configuration is still a template, with no secrets in it', () => {
  for (const name of ['wrangler.jsonc.template', 'open-next.config.ts.template']) {
    const contents = readFileSync(resolve(clientRoot, 'cloudflare', name), 'utf8')
    assert.ok(contents.length > 0)
    assert.equal(/sk_live|rk_live|Bearer\s+[A-Za-z0-9]{20}/.test(contents), false, `${name} looks like it carries a secret`)
  }
})

test('all four cache components are named, because on-demand invalidation needs all four', () => {
  const wrangler = readFileSync(resolve(clientRoot, 'cloudflare/wrangler.jsonc.template'), 'utf8')
  for (const binding of [
    'NEXT_INC_CACHE_R2_BUCKET',
    'NEXT_TAG_CACHE_D1',
    'NEXT_CACHE_DO_QUEUE',
    'NEXT_CACHE_DO_PURGE',
  ]) {
    assert.ok(wrangler.includes(binding), `${binding} is missing; revalidateTag would resolve to nothing`)
  }
})
