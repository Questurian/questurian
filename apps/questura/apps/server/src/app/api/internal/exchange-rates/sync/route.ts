import { createHash, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { syncCurrencyUsdRates } from '@/features/shared/currencies/exchange-rates'

// Hashing both sides first gives equal-length buffers, so the comparison leaks
// neither content nor length.
function secretsMatch(provided: string, configured: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest()
  const configuredDigest = createHash('sha256').update(configured).digest()
  return timingSafeEqual(providedDigest, configuredDigest)
}

function extractProvidedSecret(req: NextRequest): string {
  const bearerToken = req.headers.get('authorization')
  if (typeof bearerToken === 'string' && bearerToken.toLowerCase().startsWith('bearer ')) {
    return bearerToken.slice(7).trim()
  }

  return req.headers.get('x-sync-secret')?.trim() ?? ''
}

export async function POST(req: NextRequest) {
  const configuredSecret = process.env.EXCHANGE_RATE_SYNC_SECRET?.trim()
  if (!configuredSecret) {
    return NextResponse.json(
      { message: 'EXCHANGE_RATE_SYNC_SECRET is not configured.' },
      { status: 500 },
    )
  }

  if (!secretsMatch(extractProvidedSecret(req), configuredSecret)) {
    return NextResponse.json(
      { message: 'Unauthorized exchange-rate sync request.' },
      { status: 401 },
    )
  }

  try {
    const payload = await getPayload({ config })
    const result = await syncCurrencyUsdRates(payload)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Exchange-rate sync failed:', error)
    return NextResponse.json({ message: 'Exchange-rate sync failed.' }, { status: 500 })
  }
}
