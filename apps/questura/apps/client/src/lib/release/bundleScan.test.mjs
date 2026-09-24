import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { findLoopbackAddresses, scanBundle } from './bundleScan.mjs'

// The post-build scan (`scripts/scan-client-bundle.mjs`) fails a build whose
// browser files point at the build machine.

test('finds addresses on the build machine', () => {
  assert.deepEqual(findLoopbackAddresses('fetch(("http://localhost:4000")+"/api/me")'), ['http://localhost:4000'])
  assert.deepEqual(findLoopbackAddresses('a="http://api.readiness.localhost:4100"'), ['http://api.readiness.localhost:4100'])
  assert.deepEqual(findLoopbackAddresses('u="http://127.0.0.1:4100/x"'), ['127.0.0.1:4100'])
  assert.deepEqual(findLoopbackAddresses('u="//[::1]:3000"'), ['//[::1]:3000'])
  assert.deepEqual(findLoopbackAddresses('u="http://0.0.0.0:3000"'), ['//0.0.0.0:3000'])
})

test('ignores the word "localhost" when it is not an address', () => {
  // From the URL polyfill Next ships in polyfills-*.js.
  assert.deepEqual(findLoopbackAddresses('if("localhost"===s.host&&(s.host=""),e)return;'), [])
  assert.deepEqual(findLoopbackAddresses('fetch("https://api.questurian.com/api/me")'), [])
  assert.deepEqual(findLoopbackAddresses('https://notlocalhost.example/'), [])
})

test('scans every shipped text file and says what it looked at', () => {
  const root = mkdtempSync(join(tmpdir(), 'bundle-scan-'))
  try {
    mkdirSync(join(root, '.next/static/chunks'), { recursive: true })
    writeFileSync(join(root, '.next/static/chunks/clean.js'), 'fetch("https://api.questurian.com")')
    writeFileSync(join(root, '.next/static/chunks/dirty.js'), 'fetch("http://localhost:4000")')
    writeFileSync(join(root, '.next/static/chunks/image.png'), 'http://localhost:4000')

    const result = scanBundle(['.next/static', '.open-next/assets'], root)
    assert.deepEqual(result.scanned, ['.next/static'])
    assert.deepEqual(result.missing, ['.open-next/assets'])
    assert.deepEqual(result.hits, [{ file: join('.next/static/chunks/dirty.js'), addresses: ['http://localhost:4000'] }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
