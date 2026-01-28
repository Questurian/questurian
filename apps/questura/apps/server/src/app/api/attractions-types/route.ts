import type { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { corsResponse, handleCorsOptions } from '@/shared/utils/cors'
import { getSelectFieldOptions } from '@/shared/utils/payload-fields'

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const fields = payload.collections?.attractions?.config?.fields ?? []
    const options = getSelectFieldOptions(fields, 'type')

    if (!options) {
      return corsResponse({ error: 'Field not found' }, req, 404)
    }

    return corsResponse({ options }, req)
  } catch (error) {
    console.error('Error loading attractions types:', error)
    return corsResponse({ error: 'Failed to load attractions types' }, req, 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
