import { describe, expect, it, vi } from 'vitest'
import { Places } from './Places'
import { capturePlaceDetailTypes } from './hooks/capturePlaceDetailTypes'
import { syncPlaceDetails } from './hooks/syncPlaceDetails'

describe('Places collection decomposition', () => {
  it('wires the extracted hooks into the collection', () => {
    expect(Places.hooks?.beforeChange).toContain(capturePlaceDetailTypes)
    expect(Places.hooks?.afterChange).toContain(syncPlaceDetails)
  })

  it('captures detail types and the creator before persistence', async () => {
    const context: Record<string, unknown> = {}
    const data = {
      diningType: 'restaurant',
      accommodationType: undefined,
      nightlifeType: 'club',
      attractionType: undefined,
    }

    const result = await capturePlaceDetailTypes({
      data,
      operation: 'create',
      req: { user: { id: 17 } },
      context,
    } as never)

    expect(result).toMatchObject({ createdBy: 17 })
    expect(context.detailTypes).toEqual({
      diningType: 'restaurant',
      accommodationType: undefined,
      nightlifeType: 'club',
      attractionType: undefined,
    })
  })

  it('updates selected category details and deletes details for removed categories', async () => {
    const update = vi.fn(async () => ({}))
    const remove = vi.fn(async () => ({}))
    const find = vi.fn(async (args: {
      collection: string
      where: Record<string, unknown>
    }) => {
      if (args.collection === 'place-categories') {
        const ids = (args.where.id as { in: Array<number> }).in
        return {
          docs: ids.includes(1)
            ? [{ id: 1, slug: 'dining' }]
            : [{ id: 2, slug: 'nightlife' }],
        }
      }
      if (args.collection === 'dining-details') {
        return { docs: [{ id: 101 }] }
      }
      return { docs: [] }
    })

    const doc = {
      id: 50,
      categories: [1],
    }
    const result = await syncPlaceDetails({
      doc,
      previousDoc: { categories: [1, 2] },
      operation: 'update',
      context: { detailTypes: { diningType: 'restaurant' } },
      req: {
        payload: {
          find,
          update,
          create: vi.fn(async () => ({})),
          delete: remove,
        },
      },
    } as never)

    expect(result).toBe(doc)
    expect(update).toHaveBeenCalledWith({
      collection: 'dining-details',
      id: 101,
      data: { type: 'restaurant' },
    })
    expect(remove).toHaveBeenCalledWith({
      collection: 'nightlife-details',
      where: { place: { equals: 50 } },
    })
  })
})
