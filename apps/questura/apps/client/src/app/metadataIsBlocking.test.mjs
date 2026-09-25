import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Next streams metadata into a hidden <div> ahead of <html> for every reader
// it does not take for a bot. On a fast load that div was sometimes missing
// from the client's tree when hydration began, and /account threw React #418
// about one load in thirty (launch fix plan item 8). `htmlLimitedBots: /./`
// gives every reader blocking metadata in <head>. The browser test
// (e2e account.spec.ts, the repeated reloads) is the proof; this keeps the
// setting from being dropped as unexplained config.

const HERE = dirname(fileURLToPath(import.meta.url))
const config = readFileSync(join(HERE, '..', '..', 'next.config.ts'), 'utf8')

test('metadata is blocking for every reader', () => {
  assert.match(config, /^\s*htmlLimitedBots:\s*\/\.\/,/m)
})
