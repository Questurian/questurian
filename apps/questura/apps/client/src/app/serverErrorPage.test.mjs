import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// pages/500.tsx is what Next serves when a page cannot be rendered at all,
// e.g. an article rendered on demand while the API answers 503 (launch fix
// plan item 8, journey 10). Before it existed that was Next's built-in bare
// page with no way back. The browser journey proves it is served; these keep
// its content honest without a build.

const HERE = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(HERE, '..', 'pages', '500.tsx'), 'utf8')
const foundations = readFileSync(join(HERE, 'styles', 'global', 'foundations.css'), 'utf8').toUpperCase()

test('the 500 page offers a way back and never shows an error', () => {
  assert.match(source, /export default function ServerErrorPage/)
  assert.match(source, />\s*Something went wrong\s*</)
  assert.match(source, /href="\/"/, 'a link to the homepage')
  assert.match(source, /href=""/, 'try again is a reload of the same address')
  assert.match(source, /name="robots" content="noindex"/)
  assert.match(source, /function ServerErrorPage\(\)/, 'it takes no props, so no error can reach the page')
})

test('the 500 page uses only foundations colours, and no white', () => {
  const colours = [...source.matchAll(/#[0-9a-f]{6}\b/gi)].map((match) => match[0].toUpperCase())
  assert.ok(colours.length > 0)
  const allowed = new Set(['#5C5A56']) // the muted ink global-error.tsx also uses
  for (const colour of colours) {
    assert.ok(foundations.includes(colour) || allowed.has(colour), `${colour} is not a foundations colour`)
  }
  assert.doesNotMatch(source, /#fff\b|#ffffff|#FAF7F2|\bwhite\b/i)
  assert.match(source, /#3B5BDB/i, 'the accent is the blue --accent')
})
