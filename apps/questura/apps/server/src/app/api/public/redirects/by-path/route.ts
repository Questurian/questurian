import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

function notFound(message = 'Redirect not found.') {
  return NextResponse.json({ message }, { status: 404 })
}

// GET /api/public/redirects/by-path?path=/peru/lima/crime/is-lima-peru-safe
// Returns { newPath, statusCode } or 404.
export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get('path')
    if (!path || !path.startsWith('/')) return badRequest('path required (must start with /)')

    const payload = await getPayload({ config })

    const result = await payload.find({
      collection: 'article-redirects',
      where: { oldPath: { equals: path } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (result.totalDocs === 0) return notFound()

    const row = result.docs[0] as unknown as {
      newPath?: unknown
      statusCode?: unknown
    }
    const newPath = typeof row.newPath === 'string' ? row.newPath : null
    if (!newPath) return notFound()

    const statusCode = row.statusCode === '308' ? 308 : 301

    return NextResponse.json({ newPath, statusCode })
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to load redirect.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
