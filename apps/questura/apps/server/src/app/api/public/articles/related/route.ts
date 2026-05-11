import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { fetchRelatedMapsArticles } from '@/features/articles/public/relatedMapsArticles'

// GET /api/public/articles/related?country=...&city=...&currentSlug=...
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const country = params.get('country')
    if (!country) {
      return NextResponse.json({ message: 'country required' }, { status: 400 })
    }
    const city = params.get('city')
    const currentSlug = params.get('currentSlug')

    const payload = await getPayload({ config })
    const related = await fetchRelatedMapsArticles(payload, {
      country,
      city,
      currentSlug,
    })

    return NextResponse.json(related)
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to load related articles.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
