import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { corsResponse, handleCorsOptions } from '@/shared/utils/cors'
import { getSelectFieldOptions } from '@/shared/utils/payload-fields'

const formatLabel = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const diningFields = payload.collections?.dining?.config?.fields ?? []
    const selectOptions = getSelectFieldOptions(diningFields, 'type')

    if (selectOptions) {
      return corsResponse({ options: selectOptions }, req)
    }

    // Fallback for free-text type fields: derive options from existing dining docs.
    const result = await payload.find({
      collection: 'dining',
      depth: 0,
      limit: 1000,
      where: {
        type: {
          exists: true,
        },
      },
    })

    const values = new Set<string>()
    for (const doc of result.docs as Array<{ type?: unknown }>) {
      if (typeof doc.type !== 'string') continue
      const normalized = doc.type.trim()
      if (!normalized) continue
      values.add(normalized)
    }

    const options = Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: formatLabel(value) }))

    return corsResponse({ options }, req)
  } catch (error) {
    console.error('Error loading dining types:', error)
    return corsResponse({ error: 'Failed to load dining types' }, req, 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
