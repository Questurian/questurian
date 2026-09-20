#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/*
 * Two stylesheet entrypoints, each with a fixed import list and order.
 *
 * `globals.css` is what every route loads, so anything added to it is paid for
 * by /join, /search, the account pages and the auth pages as well. City,
 * article, itinerary and listicle styling belongs in `public-routes.css`,
 * which only the public route group loads.
 */
const ENTRYPOINTS = [
  {
    path: 'src/app/globals.css',
    imports: [
      'tailwindcss',
      './styles/global/foundations.css',
      './styles/global/membership.css',
    ],
  },
  {
    path: 'src/app/styles/public-routes.css',
    imports: [
      './global/article-prose-and-media.css',
      './global/editorial-effects.css',
      './global/featured-articles-shared-and-seven.css',
      './global/featured-articles-four.css',
      './global/featured-articles-five.css',
      './global/featured-articles-nine.css',
      './global/featured-articles-three.css',
      './global/responsive-accessibility.css',
    ],
  },
]

// Every module has to be reachable from exactly one entrypoint. A file that
// falls out of both lists is dead; a file in both is served twice.
const seen = new Set()

for (const entrypoint of ENTRYPOINTS) {
  const entrypointPath = resolve(clientRoot, entrypoint.path)
  const source = await readFile(entrypointPath, 'utf8')
  const actualImports = [...source.matchAll(/@import\s+["']([^"']+)["'];/g)].map(
    ([, importPath]) => importPath,
  )

  if (JSON.stringify(actualImports) !== JSON.stringify(entrypoint.imports)) {
    throw new Error(
      `${entrypoint.path} imports must preserve the cascade order.\nExpected: ${entrypoint.imports.join(', ')}\nActual: ${actualImports.join(', ')}`,
    )
  }

  const rules = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import\s+["'][^"']+["'];/g, '')
    .trim()

  if (rules) {
    throw new Error(`${entrypoint.path} must remain an import-only cascade entrypoint`)
  }

  for (const importPath of entrypoint.imports) {
    if (importPath === 'tailwindcss') continue

    const modulePath = resolve(dirname(entrypointPath), importPath)

    if (seen.has(modulePath)) {
      throw new Error(`${importPath} is imported by more than one entrypoint`)
    }
    seen.add(modulePath)

    const moduleCss = await readFile(modulePath, 'utf8')

    if (!moduleCss.trim()) {
      throw new Error(`${importPath} must not be empty`)
    }

    if (/@import\b/.test(moduleCss)) {
      throw new Error(`${importPath} must not add nested imports`)
    }
  }
}

// A module nobody imports is styling nothing. The count is the guard: adding a
// stylesheet without wiring it into an entrypoint fails here instead of
// silently doing nothing.
const modulesDir = resolve(clientRoot, 'src/app/styles/global')
const moduleFiles = (await readdir(modulesDir)).filter((name) => name.endsWith('.css'))

if (moduleFiles.length !== seen.size) {
  throw new Error(
    `src/app/styles/global holds ${moduleFiles.length} stylesheets but the entrypoints import ${seen.size}. Every module must be imported by exactly one entrypoint.`,
  )
}

console.log('Global CSS entrypoints, cascade order and module coverage are valid.')
