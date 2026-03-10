import { describe, expect, it, vi } from 'vitest'
import {
  buildExchangeRateApiOpenLatestUrl,
  parseExchangeRateApiOpenResponse,
  syncCurrencyUsdRates,
} from '@/features/shared/currencies/syncExchangeRates'

describe('currency exchange-rate sync', () => {
  it('builds the ExchangeRate-API open USD latest URL', () => {
    const url = buildExchangeRateApiOpenLatestUrl()

    expect(url.toString()).toBe('https://open.er-api.com/v6/latest/USD')
  })

  it('parses a valid ExchangeRate-API open USD latest payload', () => {
    const parsed = parseExchangeRateApiOpenResponse({
      result: 'success',
      base_code: 'USD',
      time_last_update_utc: 'Mon, 09 Mar 2026 00:00:01 +0000',
      time_next_update_utc: 'Tue, 10 Mar 2026 00:00:01 +0000',
      conversion_rates: {
        PEN: 3.72,
        EUR: 0.92,
      },
    })

    expect(parsed.sourceUpdatedAt).toBe('2026-03-09T00:00:01.000Z')
    expect(parsed.nextUpdateAt).toBe('2026-03-10T00:00:01.000Z')
    expect(parsed.rates.get('PEN')).toBe(3.72)
    expect(parsed.rates.get('EUR')).toBe(0.92)
  })

  it('stores latest USD snapshots on active currency docs', async () => {
    const updates: Array<{ id: number; data: Record<string, unknown> }> = []
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [
          { id: 1, code: 'USD' },
          { id: 2, code: 'PEN' },
        ],
        totalPages: 1,
      }),
      update: vi.fn(async ({ id, data }) => {
        updates.push({ id, data })
        return { id, ...data }
      }),
    }

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        result: 'success',
        base_code: 'USD',
        time_last_update_utc: 'Mon, 09 Mar 2026 00:00:01 +0000',
        time_next_update_utc: 'Tue, 10 Mar 2026 00:00:01 +0000',
        conversion_rates: {
          PEN: 3.72,
        },
      }),
    }))

    const result = await syncCurrencyUsdRates(payload as any, {
      fetchImpl: fetchImpl as any,
      now: new Date('2026-03-09T12:00:00.000Z'),
    })

    expect(result.updatedCodes).toEqual(['USD', 'PEN'])
    expect(result.skippedCodes).toEqual([])
    expect(updates).toEqual([
      {
        id: 1,
        data: {
          latestUsdRate: {
            unitsPerUsd: 1,
            provider: 'exchange-rate-api-open',
            providerDate: null,
            sourceUpdatedAt: '2026-03-09T00:00:01.000Z',
            nextUpdateAt: '2026-03-10T00:00:01.000Z',
            fetchedAt: '2026-03-09T12:00:00.000Z',
          },
        },
      },
      {
        id: 2,
        data: {
          latestUsdRate: {
            unitsPerUsd: 3.72,
            provider: 'exchange-rate-api-open',
            providerDate: null,
            sourceUpdatedAt: '2026-03-09T00:00:01.000Z',
            nextUpdateAt: '2026-03-10T00:00:01.000Z',
            fetchedAt: '2026-03-09T12:00:00.000Z',
          },
        },
      },
    ])
  })

  it('does not write any currency docs when the provider request fails', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [
          { id: 2, code: 'PEN' },
        ],
        totalPages: 1,
      }),
      update: vi.fn(),
    }

    await expect(syncCurrencyUsdRates(payload as any, {
      fetchImpl: vi.fn(async () => {
        throw new Error('Provider unavailable')
      }) as any,
      now: new Date('2026-03-09T12:00:00.000Z'),
    })).rejects.toThrow('Provider unavailable')

    expect(payload.update).not.toHaveBeenCalled()
  })
})
