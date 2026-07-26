#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entrypointPath = resolve(clientRoot, 'src/app/globals.css')
const moduleImports = [
  './styles/global/foundations.css',
  './styles/global/article-prose-and-media.css',
  './styles/global/membership.css',
  './styles/global/editorial-effects.css',
  './styles/global/featured-articles-shared-and-seven.css',
  './styles/global/featured-articles-four.css',
  './styles/global/featured-articles-five.css',
  './styles/global/featured-articles-nine.css',
  './styles/global/featured-articles-three.css',
  './styles/global/responsive-accessibility.css',
]
const expectedImports = ['tailwindcss', ...moduleImports]

const entrypoint = await readFile(entrypointPath, 'utf8')
const actualImports = [...entrypoint.matchAll(/@import\s+["']([^"']+)["'];/g)].map(
  ([, importPath]) => importPath,
)

if (JSON.stringify(actualImports) !== JSON.stringify(expectedImports)) {
  throw new Error(
    `globals.css imports must preserve the global cascade order.\nExpected: ${expectedImports.join(', ')}\nActual: ${actualImports.join(', ')}`,
  )
}

const entrypointRules = entrypoint
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/@import\s+["'][^"']+["'];/g, '')
  .trim()

if (entrypointRules) {
  throw new Error('globals.css must remain an import-only cascade entrypoint')
}

for (const importPath of moduleImports) {
  const modulePath = resolve(dirname(entrypointPath), importPath)
  const moduleCss = await readFile(modulePath, 'utf8')

  if (!moduleCss.trim()) {
    throw new Error(`${importPath} must not be empty`)
  }

  if (/@import\b/.test(moduleCss)) {
    throw new Error(`${importPath} must not add nested imports`)
  }
}

console.log('Global CSS boundaries and cascade order are valid.')
