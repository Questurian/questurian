import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const pkg = JSON.parse(readFileSync(resolve(clientRoot, 'package.json'), 'utf8'))
const read = (name) => readFileSync(resolve(clientRoot, name), 'utf8')

/**
 * The adapter is installed and the Worker has been built and previewed
 * (docs/capacity/runs/2026-09-22-L09-cloudflare-adapter.md). These guard the
 * three things about that setup which would break silently.
 */

// `@opennextjs/cloudflare@1.18.1` declares `next: ~15.4.11 || ~15.5.10 || ...`,
// and the client is on 15.5.26. Later adapters move the floor (1.19.0 wants
// >=15.5.15, 1.20.6 wants >=15.5.24 <16 || >=16.3.3). A caret on either side of
// the pair lets a routine install cross a boundary with no error until the
// build fails.
test('the adapter and Next are pinned to a compatible pair', () => {
  assert.equal(pkg.dependencies.next, '15.5.26')
  assert.equal(
    pkg.devDependencies['@opennextjs/cloudflare'],
    '1.18.1',
    'Exact, not caret: each adapter release moves its Next range. Check its peerDependencies against the pinned Next before moving it.',
  )
  assert.equal(pkg.devDependencies.wrangler, '4.136.2')
})

// Questura publishes by on-demand invalidation (ADR-0003). Without the tag
// cache, revalidateTag resolves to nothing; without cache purge it updates
// the incremental cache while the edge keeps serving the old page. Either way
// the backend's queue drains clean and the site stays stale.
test('all four cache components are configured, not just bound', () => {
  const config = read('open-next.config.ts')
  for (const [what, needle] of [
    ['incremental cache', 'incrementalCache:'],
    ['tag cache', 'tagCache:'],
    ['queue', 'queue:'],
    ['cache purge', 'cachePurge:'],
  ]) {
    assert.ok(config.includes(needle), `${what} is not wired in open-next.config.ts`)
  }

  const wrangler = read('wrangler.jsonc')
  for (const binding of [
    'NEXT_INC_CACHE_R2_BUCKET',
    'NEXT_TAG_CACHE_D1',
    'NEXT_CACHE_DO_QUEUE',
    'NEXT_CACHE_DO_PURGE',
  ]) {
    assert.ok(wrangler.includes(binding), `${binding} is missing from wrangler.jsonc`)
  }
})

// The package export map is `./*` -> `./dist/api/*.js`, and cache-purge is a
// directory. The bare specifier resolves to a file that does not exist and
// the build fails with a message that does not explain why.
test('the cache-purge import keeps its explicit /index', () => {
  assert.match(read('open-next.config.ts'), /overrides\/cache-purge\/index/)
})

test('no secret is committed in the Worker configuration', () => {
  for (const name of ['wrangler.jsonc', 'open-next.config.ts']) {
    const contents = read(name)
    assert.equal(
      /sk_live|rk_live|Bearer\s+[A-Za-z0-9]{20}|CLOUDFLARE_API_TOKEN\s*[:=]\s*["'][^"']+/.test(contents),
      false,
      `${name} looks like it carries a secret; real values belong in \`wrangler secret put\``,
    )
  }
})

// A committed .dev.vars would put the local preview's secrets in git, and the
// file is where a real token is most likely to be pasted by accident.
test('local preview secrets are ignored by git', () => {
  const ignore = read('.gitignore')
  for (const entry of ['.dev.vars', '/.open-next/', '/.wrangler/']) {
    assert.ok(ignore.includes(entry), `${entry} is not gitignored`)
  }
})
