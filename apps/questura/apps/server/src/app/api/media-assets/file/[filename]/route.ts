/**
 * The overlap route for the move to the CDN (issue #566).
 *
 * Turning on `disablePayloadAccessControl` unregisters the storage adapter's
 * static handler, so Payload stops serving `/api/media-assets/file/{filename}`
 * the moment the flag ships. Public pages are cached SSR (ADR 0003) with
 * `revalidate` up to 3600, and a cached page holds rendered HTML full of that
 * URL -- so without this route every already-cached page would emit dead image
 * URLs for up to an hour after deploy.
 *
 * This is the "overlap" half of option B in the issue: old HTML keeps working
 * through a redirect while the page cache ages out. Nothing new points here;
 * once no cached page can still be holding these URLs -- a week is plenty --
 * this directory can be deleted, and a 301 that a browser cached still lands
 * on a file that exists.
 *
 * Deliberately not `getPayload`: this needs no database. The filename is the
 * whole address, and the redirect target is built by the one function that
 * defines a public media URL.
 */

import { NextResponse } from 'next/server'

import { buildPublicMediaUrl } from '@/features/media/lib/bunny-public-url'

type RouteContext = { params: Promise<{ filename: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  const { filename: encoded } = await params

  let filename = encoded
  try {
    filename = decodeURIComponent(encoded)
  } catch {
    // Not valid percent-encoding; let the raw segment be re-encoded below.
  }

  const base = buildPublicMediaUrl(filename)
  if (!base) {
    return new NextResponse('Media storage is not configured', { status: 404 })
  }

  // The writer app cache-busts its previews with `?v=...`. Carrying the query
  // across means a redirected request still misses the cache it meant to miss.
  const { search } = new URL(req.url)
  const target = search ? `${base}${search}` : base

  return NextResponse.redirect(target, {
    status: 301,
    headers: {
      // The mapping from filename to CDN address never changes, so this is
      // safe to cache for as long as anything will still ask for it.
      'Cache-Control': 'public, max-age=2592000',
    },
  })
}

export const HEAD = GET
