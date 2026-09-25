import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { Writable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

// The article's heading and body must not wait for the sidebar's
// recommendation lookups. This renders the real ArticlePage composition through
// React's streaming server renderer with the article index deliberately held
// unresolved, and checks the heading/body bytes leave before it is released.
//
// Client components ('use client' files) are stubbed: they render nothing on
// the server that matters here and pull in browser-only code. The article
// index fetch is replaced by a promise the test controls.
//
// It needs esbuild and react-dom, so it skips itself when they are missing
// (a checkout with no `pnpm install`). esbuild is not a direct dependency of
// the client: it is the copy wrangler (a client devDependency) ships with, so
// an installed checkout always has it. CI's "Questura client tests" job
// installs, and fails if anything in this file skips.

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', '..')
const CLIENT = join(SRC, '..')
const require = createRequire(join(CLIENT, 'package.json'))

function resolvable(name) {
  try {
    require.resolve(name)
    return true
  } catch {
    return false
  }
}

// The client's own esbuild if it ever gets one, else the one wrangler uses.
function esbuildRequire() {
  if (resolvable('esbuild')) return require
  try {
    const viaWrangler = createRequire(require.resolve('wrangler/package.json'))
    viaWrangler.resolve('esbuild')
    return viaWrangler
  } catch {
    return null
  }
}

const requireEsbuild = esbuildRequire()
const missing = [
  ...(requireEsbuild ? [] : ['esbuild']),
  ...['react', 'react-dom/server'].filter((name) => !resolvable(name)),
]
const skip = missing.length > 0 ? `needs installed deps: ${missing.join(', ')}` : false

const INDEX_MODULE = join(SRC, 'features/articles/lib/fetchArticleIndex.ts')

function exportNames(source) {
  const names = new Set()
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)) {
    names.add(match[1])
  }
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()
      if (name && !name.startsWith('type ')) names.add(name)
    }
  }
  return { names: [...names], hasDefault: /export\s+default\b/.test(source) }
}

function clientStub(source) {
  const { names, hasDefault } = exportNames(source)
  const lines = [
    "import { createElement } from 'react'",
    'const Stub = (props) => createElement("span", { "data-client-stub": "" }, props?.children ?? null)',
  ]
  for (const name of names) lines.push(`export const ${name} = Stub`)
  if (hasDefault) lines.push('export default Stub')
  return lines.join('\n')
}

const INDEX_STUB = `
export async function fetchArticleIndex(params) {
  return globalThis.__articleIndex(params)
}
`

async function bundle(entry) {
  const esbuild = requireEsbuild('esbuild')
  const outdir = join(CLIENT, 'node_modules', '.cache', 'article-stream-test')
  mkdirSync(outdir, { recursive: true })
  const outfile = join(outdir, `${entry.split('/').pop().replace(/\.tsx?$/, '')}-${process.pid}.mjs`)

  await esbuild.build({
    entryPoints: [join(SRC, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    packages: 'external',
    logLevel: 'silent',
    plugins: [
      {
        name: 'article-stream-test',
        setup(build) {
          build.onResolve({ filter: /^@\// }, async (args) =>
            build.resolve(`./${args.path.slice(2)}`, { resolveDir: SRC, kind: args.kind }),
          )
          build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'next/link', namespace: 'stub' }))
          build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: clientStub('export default function Link() {}'),
            loader: 'js',
            resolveDir: CLIENT,
          }))
          build.onLoad({ filter: /\.(tsx?|jsx?)$/ }, (args) => {
            if (!args.path.startsWith(SRC)) return undefined
            if (args.path === INDEX_MODULE) return { contents: INDEX_STUB, loader: 'js' }
            const source = readFileSync(args.path, 'utf8')
            if (/^\s*['"]use client['"]/.test(source)) {
              return { contents: clientStub(source), loader: 'js', resolveDir: CLIENT }
            }
            return undefined
          })
        },
      },
    ],
  })

  return import(pathToFileURL(outfile).href)
}

const article = {
  id: 1,
  slug: 'where-to-eat-in-barranco',
  title: 'Where to eat in Barranco',
  location: 'peru|lima',
  seoSection: { metaDescription: 'A short dek.' },
  headerSection: {},
  contentBlocks: [{ blockType: 'text', id: 'p1', content: '<p>Opening paragraph of the body.</p>' }],
}

function indexItem(id) {
  return {
    id,
    title: `Recommendation ${id}`,
    slug: `recommendation-${id}`,
    excerpt: null,
    publishedAt: null,
    href: `/peru/lima/articles/recommendation-${id}`,
    thumbnail: null,
  }
}

/** Streams ArticlePage; resolves with the chunks and when each one left. */
async function streamArticle(ArticlePage, { holdMs }) {
  const React = require('react')
  const { renderToPipeableStream } = require('react-dom/server')

  // Every index lookup takes `holdMs`, so lookups made one after another
  // show up as a multiple of it.
  const requests = []
  globalThis.__articleIndex = async (params) => {
    requests.push(params.scope.kind)
    await new Promise((resolve) => setTimeout(resolve, holdMs))
    const base = params.scope.kind === 'global' ? 100 : 1
    return { items: Array.from({ length: 12 }, (_, i) => indexItem(base + i)) }
  }

  const started = performance.now()
  const chunks = []
  await new Promise((resolve, reject) => {
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push({ at: performance.now() - started, html: chunk.toString() })
        callback()
      },
      final(callback) {
        callback()
        resolve()
      },
    })
    const stream = renderToPipeableStream(
      React.createElement(ArticlePage, { article, path: '/peru/lima/articles/where-to-eat-in-barranco' }),
      {
        onShellReady() {
          stream.pipe(sink)
        },
        onShellError: reject,
        onError: reject,
      },
    )
  })
  return { chunks, requests, finished: performance.now() - started }
}

function firstChunkContaining(chunks, needle) {
  return chunks.find((chunk) => chunk.html.includes(needle))
}

test('article heading and body stream before recommendations resolve', { skip }, async () => {
  const { ArticlePage } = await bundle('features/articles/ArticlePage.tsx')
  const HOLD_MS = 400
  const { chunks, requests, finished } = await streamArticle(ArticlePage, { holdMs: HOLD_MS })
  const html = chunks.map((chunk) => chunk.html).join('')

  const heading = firstChunkContaining(chunks, 'Where to eat in Barranco</h1>')
  const body = firstChunkContaining(chunks, 'Opening paragraph of the body.')
  const trending = firstChunkContaining(chunks, 'Recommendation 1<')

  assert.ok(heading, 'heading never rendered')
  assert.ok(body, 'body never rendered')
  assert.ok(trending, 'recommendations never rendered')

  console.log(
    `[stream] heading ${heading.at.toFixed(0)} ms, body ${body.at.toFixed(0)} ms, ` +
      `recommendations ${trending.at.toFixed(0)} ms, done ${finished.toFixed(0)} ms ` +
      `(each lookup held ${HOLD_MS} ms)`,
  )

  assert.ok(
    heading.at < HOLD_MS / 2,
    `heading waited ${heading.at.toFixed(0)} ms for recommendations held ${HOLD_MS} ms`,
  )
  assert.ok(body.at < HOLD_MS / 2, `body waited ${body.at.toFixed(0)} ms for recommendations`)
  assert.ok(trending.at >= HOLD_MS - 5, 'recommendations were not actually held')

  // The ad rail keeps its place while recommendations are pending.
  const shell = chunks.filter((chunk) => chunk.at < HOLD_MS / 2).map((chunk) => chunk.html).join('')
  assert.match(shell, /data-article-sidebar/, 'ad rail missing before recommendations arrive')
  assert.doesNotMatch(shell, /Trending News|From Our Partners/, 'recommendations rendered before they loaded')

  // Local and global lookups start together rather than one after the other.
  assert.deepEqual([...requests].sort(), ['city', 'global'])
  assert.ok(finished < HOLD_MS * 1.75, `lookups ran one after another (${finished.toFixed(0)} ms)`)

  // One lookup feeds both placements: trending is local, partners are global
  // and never repeat a trending item.
  assert.match(html, /From Our Partners/)
  assert.match(html, /Recommendation 100</)
  assert.equal((html.match(/Recommendation 1</g) ?? []).length, 1)
})

// Selection semantics: trending is the narrowest non-empty scope, partners are
// global minus trending, and the global index is read once whichever path wins.
async function sidebarFor(location, indexByScope) {
  const { fetchStandardArticleSidebar } = await bundle('features/articles/lib/fetchArticleSidebar.ts')
  const requests = []
  globalThis.__articleIndex = async ({ scope }) => {
    requests.push(scope.kind)
    return { items: indexByScope[scope.kind] ?? [] }
  }
  const lists = await fetchStandardArticleSidebar({ ...article, location }, '/current')
  return { ...lists, requests }
}

const ids = (items) => items.map((item) => item.id)
const range = (from, count) => Array.from({ length: count }, (_, i) => indexItem(from + i))

test('empty city falls back to country, global read once', { skip }, async () => {
  const { trending, partners, requests } = await sidebarFor('peru|lima', {
    city: [],
    country: range(20, 8),
    global: [...range(20, 2), ...range(100, 8)],
  })
  assert.deepEqual(ids(trending), [20, 21, 22, 23, 24])
  assert.deepEqual(ids(partners), [100, 101, 102, 103, 104])
  assert.deepEqual([...requests].sort(), ['city', 'country', 'global'])
})

test('no local articles: global feeds both lists without a second read', { skip }, async () => {
  const { trending, partners, requests } = await sidebarFor('peru|lima', {
    global: range(100, 12),
  })
  assert.deepEqual(ids(trending), [100, 101, 102, 103, 104])
  assert.deepEqual(ids(partners), [105, 106, 107, 108, 109])
  assert.equal(requests.filter((kind) => kind === 'global').length, 1)
})

test('article without a location uses the global index once', { skip }, async () => {
  const { trending, partners, requests } = await sidebarFor(undefined, {
    global: [{ ...indexItem(1), slug: article.slug }, ...range(100, 12)],
  })
  assert.deepEqual(ids(trending), [100, 101, 102, 103, 104])
  assert.deepEqual(ids(partners), [105, 106, 107, 108, 109])
  assert.deepEqual(requests, ['global'])
})
