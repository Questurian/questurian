import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Railway builds this app with the Node its `engines.node` names. A range like
 * ">=20.9.0" lets the builder pick the newest Node, and on Node 24 every
 * visitor sign-in answered 500 (see `client-identity.ts`). So the server
 * pins the one major CI tests on, and this test keeps the two together.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER = resolve(HERE, '../..')
const REPO = resolve(SERVER, '../../../..')

describe('Node version', () => {
  const engines = JSON.parse(readFileSync(resolve(SERVER, 'package.json'), 'utf8')).engines as { node: string }
  const ciNode = /NODE_VERSION:\s*'(\d+)'/.exec(readFileSync(resolve(REPO, '.github/workflows/ci.yml'), 'utf8'))?.[1]

  it('pins one major, not a range the builder can resolve upward', () => {
    expect(engines.node).toMatch(/^\d+\.x$/)
  })

  it('pins the major CI tests on', () => {
    expect(ciNode).toBeDefined()
    expect(engines.node).toBe(`${ciNode}.x`)
  })
})
