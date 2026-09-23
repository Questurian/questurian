import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const NAVBARS = [
  ['DesktopNavbar', './Desktop/DesktopNavbar.tsx'],
  ['MobileNavbar', './Mobile/MobileNavbar.tsx'],
]

/**
 * `/api/me` is a client call and the public pages are statically cached, so
 * the navbar learns who is reading only after hydration. Both navbars used to
 * render nothing in that slot while waiting, which gave it no width — and the
 * Subscribe button beside it jumped 58.7px left when "Sign in" finally
 * arrived. Measured at 1280px, 2026-09-20.
 *
 * The slot has to keep its width while empty. These tests fail if a navbar
 * goes back to placing the control itself, or if the reservation is dropped.
 */
test('neither navbar renders the auth control outside the reserved slot', () => {
  for (const [name, path] of NAVBARS) {
    const source = read(path)
    assert.match(source, /<AuthSlot\b/, `${name} no longer uses AuthSlot`)
    assert.doesNotMatch(
      source,
      /<SignInButton\b/,
      `${name} places SignInButton itself again, which leaves the slot empty while loading`,
    )
    assert.doesNotMatch(
      source,
      /<UserIcon\b/,
      `${name} places UserIcon itself again, which leaves the slot empty while loading`,
    )
  }
})

test('the slot reserves the signed-in menu width at both breakpoints', () => {
  const source = read('./shared/components/AuthSlot.tsx')

  // UserIcon is the widest control the slot can hold: 58px under the 480
  // breakpoint and 68px above it, against roughly 35px and 43px for "Sign in".
  assert.match(source, /min-w-\[58px\]/, 'AuthSlot dropped its base width reservation')
  assert.match(source, /480:min-w-\[68px\]/, 'AuthSlot dropped its 480 width reservation')
})

test('while loading, the slot shows a pending Sign in the hint can hide', () => {
  const source = read('./shared/components/AuthSlot.tsx')

  // An empty slot made Sign in lag Subscribe by a whole /api/me round trip.
  // Now it paints with the page; the pre-paint hint (identityHint.ts) hides
  // it for a reader this browser last saw signed in.
  assert.doesNotMatch(source, /loading \? null/, 'AuthSlot renders nothing while loading again')
  assert.match(source, /<SignInButton[^>]*nav-signin[^>]*pending/, 'AuthSlot dropped the pending Sign in')
})

test('both navbars mark Subscribe pending while loading, and the CSS hides by hint', () => {
  for (const [name, path] of NAVBARS) {
    const source = read(path)
    assert.match(source, /nav-subscribe/, `${name} dropped the nav-subscribe class`)
    assert.match(source, /data-pending=\{loading \|\| undefined\}/, `${name} no longer marks Subscribe pending`)
  }

  const css = read('../../app/styles/global/foundations.css')
  assert.match(css, /html\[data-identity="member"\] \.nav-subscribe\[data-pending\]/)
  assert.match(css, /html\[data-identity="user"\] \.nav-signin\[data-pending\]/)
  assert.match(css, /visibility: hidden/, 'hint must hide with visibility so the slot keeps its width')
})
