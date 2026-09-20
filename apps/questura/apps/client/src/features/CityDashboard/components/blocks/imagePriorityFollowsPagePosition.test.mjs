import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const blocksDir = fileURLToPath(new URL('.', import.meta.url))
const navbarPath = fileURLToPath(
  new URL('../../../Navigation/Navbar.tsx', import.meta.url),
)

function filesUnder(dir, extension) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(path, extension)
    return entry.name.endsWith(extension) ? [path] : []
  })
}

// A layout cannot tell whether it is the first thing on the page or the
// ninth. When each one hardcoded its own eagerness, /peru/lima downloaded
// eight off-screen photos ahead of the six that were actually visible.
// Eagerness comes from `heroImagePriority(blockIndex)` and nowhere else.
test('no block layout hardcodes an eager image', () => {
  for (const path of filesUnder(blocksDir, '.tsx')) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(
      source,
      /loading=["']eager["']/,
      `${path} hardcodes loading="eager" — derive it from heroImagePriority(blockIndex)`,
    )
    assert.doesNotMatch(
      source,
      /fetchPriority=["']high["']/,
      `${path} hardcodes fetchPriority="high" — derive it from heroImagePriority(blockIndex)`,
    )
    // The same bug in its other spelling: a layout electing its own first
    // card without asking where the block sits. Six components did this and
    // the eager-string check above sails straight past them.
    assert.doesNotMatch(
      source,
      /isPriority=\{(index|itemIndex) === 0\}/,
      `${path} makes its own first item eager — use isPriorityImage(blockIndex, index)`,
    )
    assert.doesNotMatch(
      source,
      /(loading|fetchPriority)=\{\w+ === 0 \?/,
      `${path} decides priority from an item index alone — use isPriorityImage(blockIndex, index)`,
    )
    assert.doesNotMatch(
      source,
      /\bisPriority\s*$/m,
      `${path} passes a bare isPriority — use isPriorityImage(blockIndex, index)`,
    )
  }
})

// The eight card layouts below have no client-side code at all. Their only
// importer chain (blockLayoutRegistry -> CityHomepageContent -> page) is
// server-rendered throughout, so a stray 'use client' puts them back in the
// browser bundle for nothing.
const SERVER_RENDERED_LAYOUTS = [
  'featured-article/FeaturedArticleOneArticlePreview.tsx',
  'featured-articles/FeaturedArticlesThreeArticlePreview.tsx',
  'featured-articles/FeaturedArticlesFourArticlePreview.tsx',
  'featured-articles/FeaturedArticlesFiveArticlePreview.tsx',
  'featured-articles/FeaturedArticlesSevenArticlePreview.tsx',
  'featured-articles/FeaturedArticlesEightArticlePreview.tsx',
  'featured-articles/FeaturedArticlesNineArticlePreview.tsx',
  'article-grid/ArticleGridPreview.tsx',
  'article-list/ArticleListPreview.tsx',
]

test('the card layouts stay on the server', () => {
  for (const relativePath of SERVER_RENDERED_LAYOUTS) {
    const source = readFileSync(join(blocksDir, relativePath), 'utf8')
    assert.doesNotMatch(
      source,
      /^['"]use client['"]/m,
      `${relativePath} went back to the client`,
    )
  }
})

// The navbar is a client component and stays one, but it must render its
// real markup on the first pass. A mount gate puts an empty grey bar in the
// server HTML and leaves the header blank until hydration.
test('the navbar renders its markup on the first render', () => {
  const source = readFileSync(navbarPath, 'utf8')
  assert.doesNotMatch(source, /hasMounted/, 'Navbar.tsx regained a mount gate')
  assert.doesNotMatch(
    source,
    /animate-pulse/,
    'Navbar.tsx regained a placeholder bar',
  )
})

// The lerp loop writes two custom properties every frame. It has to stop
// when the value has settled, or it runs for the lifetime of the tab.
test('the navbar collapse loop stops when it settles', () => {
  const source = readFileSync(navbarPath, 'utf8')
  assert.match(
    source,
    /if \(currentVal === targetVal\) \{\s*rafId = 0\s*;?\s*return/,
    'Navbar.tsx no longer stops its requestAnimationFrame loop when settled',
  )
})
