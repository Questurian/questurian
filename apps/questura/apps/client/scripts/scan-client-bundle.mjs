#!/usr/bin/env node
/**
 * node scripts/scan-client-bundle.mjs [dir ...]
 *
 * Fails when the files a browser downloads mention localhost, 127.0.0.1 or
 * any other address on the build machine. Runs after `next build` (the
 * `build` script) and again after `opennextjs-cloudflare build`
 * (docs/capacity/h01-provisioning-checklist.md, step 19).
 *
 * Default directories: `<NEXT_DIST_DIR or .next>/static` and
 * `.open-next/assets`, whichever exist. At least one must.
 *
 * The readiness sandbox builds with loopback addresses on purpose
 * (`QUESTURA_BUILD_TARGET=readiness`), so there the scan says it is skipped.
 */
import { scanBundle } from '../src/lib/build/bundleScan.mjs'

if (process.env.QUESTURA_BUILD_TARGET?.trim() === 'readiness') {
  console.log('Bundle scan skipped: readiness sandbox build (QUESTURA_BUILD_TARGET=readiness).')
  process.exit(0)
}

const dirs = process.argv.slice(2)
const { hits, scanned, missing } = scanBundle(
  dirs.length > 0 ? dirs : [`${process.env.NEXT_DIST_DIR || '.next'}/static`, '.open-next/assets'],
)

if (scanned.length === 0) {
  console.error(`Bundle scan found nothing to scan (looked for ${missing.join(', ')}). Build first.`)
  process.exit(1)
}

if (hits.length > 0) {
  console.error('The built site still points at the computer it was built on. Visitors cannot reach these addresses:\n')
  for (const { file, addresses } of hits.slice(0, 20)) console.error(`  ${file}: ${addresses.join(', ')}`)
  if (hits.length > 20) console.error(`  … and ${hits.length - 20} more files`)
  console.error(
    '\nA setting was missing or wrong when the site was built (usually NEXT_PUBLIC_BACKEND_URL or NEXT_PUBLIC_APP_URL).' +
      '\nFix it and build again. Do not deploy this build.',
  )
  process.exit(1)
}

console.log(`Bundle scan: no localhost or loopback addresses in ${scanned.join(', ')}.`)
