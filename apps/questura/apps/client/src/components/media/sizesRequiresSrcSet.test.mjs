import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * The regression guard for issue #563.
 *
 * Twenty call sites shipped a carefully-chosen `sizes` value against an `<img>`
 * that carried no `srcSet`. The browser ignores `sizes` in that state and takes
 * the only file on offer, so every one of those values was dead code that read
 * as if it were doing something — and nobody noticed for as long as it took to
 * measure a 7.43 MB page.
 *
 * This scans source text rather than rendering, because the client test runner
 * strips types but does not compile JSX. That turns out to be the stronger
 * check: it covers every file in the client, not just the one component, so a
 * new raw `<img>` cannot reintroduce the same dead attribute.
 */

const CLIENT_SRC = fileURLToPath(new URL('../../', import.meta.url))

/** JSX elements that resolution-switch themselves, as opposed to delegating to PublicImage. */
const RESOLUTION_SWITCHING_TAGS = ['img', 'source']

const collectTsxFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectTsxFiles(path)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : []
  })

/**
 * Walk one JSX opening tag, tracking brace depth and quotes so a `>` inside an
 * expression (`${a > b}`) or a string does not end the tag early.
 */
const readOpeningTag = (source, start) => {
  let depth = 0
  let quote = null

  for (let index = start; index < source.length; index += 1) {
    const character = source[index]

    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = null
      continue
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character
      continue
    }
    if (character === '{') depth += 1
    else if (character === '}') depth -= 1
    else if (character === '>' && depth === 0) return source.slice(start, index + 1)
  }

  return source.slice(start)
}

const findOpeningTags = (source, tag) => {
  const tags = []
  const opener = `<${tag}`

  for (let index = source.indexOf(opener); index !== -1; index = source.indexOf(opener, index + 1)) {
    // `<image` must not match `<img`, and `<sources` must not match `<source`.
    if (/[A-Za-z0-9]/.test(source[index + opener.length] ?? '')) continue
    tags.push(readOpeningTag(source, index))
  }

  return tags
}

const hasAttribute = (tag, attribute) => new RegExp(`(?<![A-Za-z])${attribute}\\s*=`).test(tag)

test('no element offers sizes without a srcSet to choose from', () => {
  const offenders = []

  for (const file of collectTsxFiles(CLIENT_SRC)) {
    const source = readFileSync(file, 'utf8')

    for (const tag of RESOLUTION_SWITCHING_TAGS.flatMap((name) => findOpeningTags(source, name))) {
      if (!hasAttribute(tag, 'sizes')) continue
      if (hasAttribute(tag, 'srcSet')) continue
      offenders.push(`${relative(CLIENT_SRC, file)}: ${tag.replace(/\s+/g, ' ').slice(0, 120)}`)
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `sizes is ignored by the browser unless srcSet gives it something to pick from:\n${offenders.join('\n')}`,
  )
})

test('PublicImage ties the two attributes together rather than trusting callers', () => {
  // Call sites pass `sizes` unconditionally; PublicImage is the single place
  // that knows whether a srcSet was buildable, so it is the only place that can
  // withhold `sizes`. If this pairing is ever loosened, the scan above stops
  // protecting the twenty call sites that route through here.
  const source = readFileSync(new URL('./PublicImage.tsx', import.meta.url), 'utf8')

  assert.match(source, /const srcSet = buildSrcSet\(/)
  assert.match(source, /srcSet=\{srcSet\}/)
  assert.match(source, /sizes=\{srcSet \? sizes : undefined\}/)
})
