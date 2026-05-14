import type { Payload } from 'payload'

import type {
  ActiveCurrencyDoc,
  LatestUsdRateSnapshot,
} from '../types'

import { normalizeCurrencyCode } from './normalizers'

export type ActiveCurrency = {
  id: number
  code: string
}

export async function loadActiveCurrencies(payload: Payload): Promise<ActiveCurrency[]> {
  const docs: ActiveCurrency[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const result = await payload.find({
      collection: 'currencies',
      limit: 200,
      page,
      depth: 0,
      overrideAccess: true,
      where: {
        status: {
          equals: 'active',
        },
      },
      sort: 'code',
      select: {
        id: true,
        code: true,
      },
    } as any)

    for (const rawDoc of (result.docs ?? []) as ActiveCurrencyDoc[]) {
      const code = normalizeCurrencyCode(rawDoc.code)
      if (typeof rawDoc.id === 'number' && code) {
        docs.push({ id: rawDoc.id, code })
      }
    }

    totalPages = typeof result.totalPages === 'number' && result.totalPages > 0
      ? result.totalPages
      : 1
    page += 1
  }

  return docs
}

export async function saveLatestUsdRateSnapshot(
  payload: Payload,
  {
    currencyId,
    snapshot,
  }: {
    currencyId: number
    snapshot: LatestUsdRateSnapshot
  },
): Promise<void> {
  await payload.update({
    collection: 'currencies',
    id: currencyId,
    overrideAccess: true,
    depth: 0,
    data: {
      latestUsdRate: {
        unitsPerUsd: snapshot.unitsPerUsd,
        provider: snapshot.provider,
        providerDate: null,
        sourceUpdatedAt: snapshot.sourceUpdatedAt,
        nextUpdateAt: snapshot.nextUpdateAt,
        fetchedAt: snapshot.fetchedAt,
      },
    },
  } as any)
}
