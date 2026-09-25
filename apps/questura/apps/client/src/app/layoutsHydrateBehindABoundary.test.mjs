import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// React 19.1/19.2 replays a DOM-element fiber whose client child finished
// loading mid-hydration without rewinding the hydration cursor, so the element
// claims its own first child and the page is thrown away (#418 on about one
// fast /account load in seventy, launch fix plan item 8). A fallback-less
// Suspense boundary directly inside each layout <div> that wraps client
// children stops it. The browser proof is e2e account.spec.ts; this keeps the
// boundaries from being "tidied" away.

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(HERE, path), 'utf8')

for (const [file, source] of [
  ['app/layout.tsx', read('layout.tsx')],
  ['components/layout/SiteFonts.tsx', read('../components/layout/SiteFonts.tsx')],
]) {
  test(`${file} puts its children behind a Suspense boundary`, () => {
    assert.match(source, /import \{ Suspense \} from "react";/)
    assert.match(source, /<Suspense fallback=\{null\}>\{children\}<\/Suspense>/)
  })
}
