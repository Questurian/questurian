import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { syncCurrencyUsdRates } from '@/features/shared/currencies/exchange-rates'

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

  if (extractProvidedSecret(req) !== configuredSecret) {
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
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Exchange-rate sync failed.',
      },
      { status: 500 },
    )
  }
}
