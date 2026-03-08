import { describe, expect, it } from 'vitest'
import {
  buildLocationOptionsQuery,
  locationIdentityFields,
} from '@/shared/location/constants'

describe('location query helpers', () => {
  it('builds a lightweight locations query for picker data', () => {
    const url = buildLocationOptionsQuery(2, 500)
    const params = new URL(url, 'https://example.com').searchParams

    expect(new URL(url, 'https://example.com').pathname).toBe('/api/locations')
    expect(params.get('page')).toBe('2')
    expect(params.get('limit')).toBe('500')
    expect(params.get('depth')).toBe('0')

    for (const field of locationIdentityFields) {
      expect(params.get(`select[${field}]`)).toBe('true')
    }
  })
})
