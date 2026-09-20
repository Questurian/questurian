import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const blocksDir = fileURLToPath(new URL('.', import.meta.url))
const stylesDir = fileURLToPath(new URL('../../../../app/styles/global/', import.meta.url))

function filesUnder(dir, extension) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(path, extension)
    return entry.name.endsWith(extension) ? [path] : []
  })
}

// A card's headline, dek and byline are in the server HTML. Reintroducing a
// flag that waits on an image load hides them until hydration, which is what
// issue #569 removed. The shimmer belongs inside the image box and nowhere else.
test('no card component gates its own text on an image load', () => {
  for (const path of filesUnder(blocksDir, '.tsx')) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /data-content-ready/, `${path} reintroduces data-content-ready`)
    assert.doesNotMatch(source, /city-skeleton-line/, `${path} reintroduces a text skeleton`)
  }
})

test('no featured-article stylesheet hides copy behind a readiness flag', () => {
  for (const path of filesUnder(stylesDir, '.css')) {
    const css = readFileSync(path, 'utf8')
    assert.doesNotMatch(css, /\[data-content-ready/, `${path} reintroduces the text gate`)
  }
})

// The cards used to render their photo at opacity-0 and fade it in from an
// onLoad handler, with a mount-time `complete` check to catch images that
// finished before hydration. That check still needed hydration: a decoded,
// cached image stayed invisible until the bundle arrived, and never appeared
// at all with JavaScript switched off. A successful image is now the server's
// HTML and nothing else.
test('no card hides a successful image behind a load flag', () => {
  for (const path of filesUnder(blocksDir, '.tsx')) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /onLoad=/, `${path} reveals an image from a load handler`)
    assert.doesNotMatch(
      source,
      /naturalWidth/,
      `${path} reconciles a missed load event, which still waits for hydration`,
    )
  }
})

// Failure is the one case that genuinely needs JavaScript: a broken URL has to
// fall back to the grey tile behind it. That is allowed, and it is the only
// thing opacity-0 may still be conditioned on.
test('the only remaining image opacity gate is failure', () => {
  for (const path of filesUnder(blocksDir, '.tsx')) {
    const source = readFileSync(path, 'utf8')
    for (const [line] of source.matchAll(/^.*opacity-0.*$/gm)) {
      assert.match(
        line,
        /hasFailed/,
        `${path} conditions an image on something other than failure: ${line.trim()}`,
      )
    }
  }
})
