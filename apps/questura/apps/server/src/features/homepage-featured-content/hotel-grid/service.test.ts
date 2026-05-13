import { beforeEach, describe, expect, it, vi } from 'vitest'

import { searchHotelGridCandidates } from './service'

function createPayloadMock() {
  return {
    findByID: vi.fn(),
    find: vi.fn(),
  }
}

describe('hotel grid service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies location + locationRef scope to accommodation search when locationKey is set', async () => {
    const payload = createPayloadMock()
    payload.find.mockImplementation(
      (args: { collection: string; where?: unknown; page?: number }) => {
        if (args.collection === 'locations') {
          return Promise.resolve({
            docs: [
              { id: 10, locationKey: 'peru|lima' },
              { id: 11, locationKey: 'peru|lima|miraflores' },
            ],
            totalDocs: 2,
            totalPages: 1,
            page: args.page ?? 1,
            limit: 500,
          })
        }
        if (args.collection === 'accommodations') {
          return Promise.resolve({
            docs: [],
            totalDocs: 0,
            totalPages: 1,
            page: 1,
            limit: 24,
          })
        }
        return Promise.resolve({ docs: [], totalDocs: 0, totalPages: 1 })
      },
    )

    await searchHotelGridCandidates(payload as never, {
      locationKey: 'peru|lima',
      page: 1,
      limit: 24,
    })

    const accCalls = payload.find.mock.calls.filter(
      (call) => (call[0] as { collection: string }).collection === 'accommodations',
    )
    expect(accCalls).toHaveLength(1)
    const accFind = accCalls[0]![0] as { where: { and?: unknown[]; or?: unknown[] } }
    const top = accFind.where
    const orList =
      top.or
      ?? (Array.isArray(top.and)
        ? (top.and.find(
            (clause: unknown) =>
              typeof clause === 'object' && clause !== null && 'or' in (clause as object),
          ) as { or: unknown } | undefined)?.or
        : undefined)
    expect(Array.isArray(orList)).toBe(true)
    expect(orList).toEqual(
      expect.arrayContaining([
        { location: { in: ['peru|lima', 'peru|lima|miraflores'] } },
        { locationRef: { in: expect.arrayContaining([10, 11]) } },
      ]),
    )
  })

  it('returns empty docs when scope resolves to no keys and no refs', async () => {
    const payload = createPayloadMock()
    payload.find.mockResolvedValue({ docs: [], totalPages: 1 })

    const response = await searchHotelGridCandidates(payload as never, {
      // normalizes to an empty key; getLocationScope returns { keys: [], refs: [] }
      locationKey: '|||',
    })

    expect(response.docs).toEqual([])
    expect(response.totalDocs).toBe(0)
    const accCalls = payload.find.mock.calls.filter(
      (call) => (call[0] as { collection: string }).collection === 'accommodations',
    )
    expect(accCalls).toHaveLength(0)
  })
})
