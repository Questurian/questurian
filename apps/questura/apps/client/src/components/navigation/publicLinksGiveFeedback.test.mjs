import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Source guards for navigation feedback. They run in CI, where the rendering
// test (articleStreamsBeforeRecommendations) skips for lack of installed deps.

const SRC = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFileSync(join(SRC, path), 'utf8')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

// Account and auth screens are private flows with their own redirects; the
// public-link pass deliberately leaves them on plain next/link.
const PRIVATE_LINKS = new Set([
  'app/(private)/(auth)/auth/reset-password/page.tsx',
  'features/AccountPage/components/Bookmarks/BookmarksSection.tsx',
  'features/AccountPage/components/Membership/MembershipPrimaryActions.tsx',
  'features/Payments/pages/SubscriptionCancelPage.tsx',
  'features/Payments/pages/SubscriptionSuccessPage.tsx',
  'features/bookmarks/pages/BookmarksPage.tsx',
])

test('public links go through PublicLink, which reports pending state', () => {
  const direct = sourceFiles(SRC)
    .map((path) => relative(SRC, path))
    .filter((path) => path !== 'components/navigation/PublicLink.tsx')
    .filter((path) => /from ['"]next\/link['"]/.test(read(path)))
    .filter((path) => !PRIVATE_LINKS.has(path))
  assert.deepEqual(direct, [], 'import Link from @/components/navigation/PublicLink instead')

  const publicLink = read('components/navigation/PublicLink.tsx')
  assert.match(publicLink, /useLinkStatus\(\)/)
  assert.match(publicLink, /reportPendingLink\(\)/)
})

// A menu that closes on click unmounts its links, and a link's own pending
// state unmounts with it. These navigations must run in the root owner.
test('links inside self-closing menus hand feedback to the root owner', () => {
  for (const file of ['components/layout/MenuModal.tsx', 'components/layout/UserModal.tsx']) {
    const source = read(file)
    const closingLinks = [...source.matchAll(/<Link\b[^>]*?onClick=\{onClose\}/gs)]
    assert.ok(closingLinks.length > 0, `${file} has no closing links to check`)
    for (const [link] of closingLinks) {
      assert.match(link, /keepFeedbackAfterUnmount/, `${file}: a closing link drops its feedback`)
    }
  }
  assert.match(read('components/layout/MenuModal.tsx'), /navigateWithFeedback\(href\)/)
  assert.match(read('features/authors/components/AuthorLink.tsx'), /navigateWithFeedback\(href\)/)
})

test('the feedback owner is mounted once, in the root layout', () => {
  assert.match(read('app/layout.tsx'), /<NavigationFeedback \/>/)
})

// The article must not wait for its recommendation lookups.
test('ArticlePage starts the sidebar lookup without awaiting it', () => {
  const page = read('features/articles/ArticlePage.tsx')
  assert.doesNotMatch(page, /await\s+fetchStandardArticleSidebar/)
  assert.match(page, /<StreamedArticleRail sidebar=\{sidebar\} \/>/)
  assert.match(page, /<StreamedArticlePartners sidebar=\{sidebar\} \/>/)
})

test('pending feedback is announced from the message catalog', () => {
  const messages = JSON.parse(readFileSync(join(SRC, '../messages/en.json'), 'utf8'))
  assert.equal(typeof messages.navigation?.loading, 'string')
  assert.match(read('components/navigation/NavigationFeedback.tsx'), /messages\.navigation\.loading/)
})
