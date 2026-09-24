import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * The second lock behind `productionBuildEnv.ts`: read what the build
 * actually produced for browsers and refuse any address on the build
 * machine. The guard checks what the build was given; this checks what came
 * out, so a fallback compiled in by some other path is caught too.
 *
 * Only address-shaped text counts. The URL polyfill compares a host with the
 * word "localhost", and that is not a reference to anywhere.
 */

const PATTERNS = [
  // http://localhost:4000, //localhost, http://api.readiness.localhost:4100
  /(?:https?:)?\/\/(?:[a-z0-9-]+\.)*localhost(?![a-z0-9-])(?::\d+)?/gi,
  /\b127(?:\.\d{1,3}){3}(?::\d+)?\b/g,
  /\/\/0\.0\.0\.0(?::\d+)?/g,
  /\/\/\[::1\](?::\d+)?/g,
]

const TEXT_FILE = /\.(?:m?js|css|html?|json|txt|xml|webmanifest|svg|rsc)$/i

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) yield* files(path)
    else if (TEXT_FILE.test(entry)) yield path
  }
}

/** Loopback addresses found in the text of `source`, with a little context. */
export function findLoopbackAddresses(source) {
  const found = []
  for (const pattern of PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      found.push(match[0])
    }
  }
  return [...new Set(found)]
}

/**
 * Every shipped file under `dirs` that mentions an address on the build
 * machine. Directories that do not exist are skipped and reported, so the
 * caller can tell "clean" from "looked at nothing".
 */
export function scanBundle(dirs, root = process.cwd()) {
  const hits = []
  const scanned = []
  const missing = []
  for (const dir of dirs) {
    const absolute = join(root, dir)
    if (!existsSync(absolute)) {
      missing.push(dir)
      continue
    }
    scanned.push(dir)
    for (const file of files(absolute)) {
      const addresses = findLoopbackAddresses(readFileSync(file, 'utf8'))
      if (addresses.length > 0) hits.push({ file: relative(root, file), addresses })
    }
  }
  return { hits, scanned, missing }
}
