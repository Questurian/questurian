import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

// global-error.tsx is the page shown when the root layout itself fails
// (launch fix plan item 17). It replaces the whole document, so it must bring
// its own <html>/<body>, stay on the foundations palette without the global
// stylesheet, offer a way back, and never print the error's text.
//
// The source checks always run. The render needs typescript and react-dom,
// which CI's client job does not install, so it skips itself without them.

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENT = join(HERE, '..', '..')
const PAGE = join(HERE, 'global-error.tsx')
const FOUNDATIONS = join(HERE, 'styles', 'global', 'foundations.css')
const require = createRequire(join(CLIENT, 'package.json'))

const source = readFileSync(PAGE, 'utf8')

function resolvable(name) {
  try {
    require.resolve(name)
    return true
  } catch {
    return false
  }
}

const missing = ['typescript', 'react', 'react-dom/server'].filter((name) => !resolvable(name))
const skip = missing.length > 0 ? `needs installed deps: ${missing.join(', ')}` : false

test('global-error is a client component that renders its own document', () => {
  assert.match(source, /^\s*['"]use client['"]/)
  assert.match(source, /<html\b/)
  assert.match(source, /<body\b/)
  assert.match(source, /export default function GlobalError/)
})

test('global-error uses only foundations colours, and no white', () => {
  const foundations = readFileSync(FOUNDATIONS, 'utf8').toUpperCase()
  const colours = [...source.matchAll(/#[0-9a-f]{6}\b/gi)].map((match) => match[0].toUpperCase())
  assert.ok(colours.length > 0)
  // Muted text is the one shade not declared as a token; it is the ink on
  // the ground at reading contrast, kept in the warm family.
  const allowed = new Set(['#5C5A56'])
  for (const colour of colours) {
    assert.ok(foundations.includes(colour) || allowed.has(colour), `${colour} is not a foundations colour`)
  }
  assert.doesNotMatch(source, /#fff\b|#ffffff|#FAF7F2|\bwhite\b/i, 'no white or near-white surfaces')
  assert.match(source, /#3B5BDB/i, 'the accent is the blue --accent')
})

test('global-error hands the error to the reporter (item 3), not to the page', () => {
  assert.match(source, /reportBrowserError\(error/)
  assert.doesNotMatch(source, /\{error\.message\}|error\.stack/, 'the error text must never reach the reader')
})

async function loadPage() {
  const ts = require('typescript')
  const { outputText } = ts.transpileModule(
    source.replace(
      /import \{ reportBrowserError \} from '@\/lib\/observability\/reportBrowserError';?/,
      'const reportBrowserError = (...args) => { globalThis.__reported = args };',
    ),
    { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  )
  assert.doesNotMatch(outputText, /@\/lib\/observability/, 'the reporter import was not stubbed')
  const outdir = join(CLIENT, 'node_modules', '.cache', 'global-error-test')
  mkdirSync(outdir, { recursive: true })
  const outfile = join(outdir, `global-error-${process.pid}.mjs`)
  writeFileSync(outfile, outputText)
  return (await import(pathToFileURL(outfile).href)).default
}

test('global-error renders a plain page with a way back, a reference and no error text', { skip }, async () => {
  const GlobalError = await loadPage()
  const { createElement } = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')

  const error = Object.assign(new Error('secret internal detail'), { digest: '1234567' })
  const html = renderToStaticMarkup(createElement(GlobalError, { error, reset: () => undefined }))

  assert.match(html, /^<html lang="en"/)
  assert.match(html, /<body\b/)
  assert.match(html, /<h1[^>]*>Something went wrong<\/h1>/)
  assert.match(html, /<button[^>]*type="button"[^>]*>Try again<\/button>/)
  assert.match(html, /<a[^>]*href="\/"[^>]*>Go to the homepage<\/a>/)
  assert.match(html, /Reference 1234567/)
  assert.doesNotMatch(html, /secret internal detail/)

  const withoutDigest = renderToStaticMarkup(createElement(GlobalError, { error: new Error('x'), reset: () => undefined }))
  assert.doesNotMatch(withoutDigest, /Reference/)
})
