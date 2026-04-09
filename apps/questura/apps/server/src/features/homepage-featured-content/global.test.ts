import { describe, expect, it } from 'vitest'

import { HomepageFeaturedContent } from './global'

const beforeValidateHook = HomepageFeaturedContent.hooks?.beforeValidate?.[0]

function buildReq(statusByKey: Record<string, 'draft' | 'published'> = {}) {
  return {
    payload: {
      findByID: async ({
        collection,
        id,
      }: {
        collection: string
        id: number
      }) => {
        const key = `${collection}:${id}`
        const status = statusByKey[key]

        if (!status) {
          throw new Error(`Not found: ${key}`)
        }

        return {
          id,
          title: `${collection} ${id}`,
          status,
          updatedAt: '2026-04-09T10:00:00.000Z',
        }
      },
    },
  } as never
}

function buildItems(
  count = 10,
  collection: 'articles' | 'single-type-listicles' | 'listicle-itineraries' = 'articles',
) {
  return Array.from({ length: count }, (_, index) => ({
    relationTo: collection,
    value: index + 1,
  }))
}

async function runBeforeValidate(
  items: unknown[],
  statusByKey: Record<string, 'draft' | 'published'>,
) {
  if (!beforeValidateHook) {
    throw new Error('HomepageFeaturedContent beforeValidate hook is unavailable')
  }

  return beforeValidateHook({
    data: {
      items,
    },
    req: buildReq(statusByKey),
  } as never)
}

function buildStatusMap(
  items: Array<{
    value: number
  }>,
): Record<string, 'draft' | 'published'> {
  return items.reduce<Record<string, 'draft' | 'published'>>((acc, item) => {
    acc[`articles:${item.value}`] = 'published'
    return acc
  }, {})
}

describe('HomepageFeaturedContent global validation', () => {
  it('accepts exactly 10 unique supported items', async () => {
    const items = buildItems()
    const statuses = buildStatusMap(items)

    const result = await runBeforeValidate(items, statuses)

    expect(result).toEqual({
      items: items.map((item) => ({
        relationTo: item.relationTo,
        value: item.value,
      })),
    })
  })

  it('rejects fewer than 10 items', async () => {
    const items = buildItems(9)
    const statuses = buildStatusMap(items)

    await expect(runBeforeValidate(items, statuses)).rejects.toThrow(
      'Homepage featured content requires exactly 10 items.',
    )
  })

  it('rejects duplicate entries', async () => {
    const items = [...buildItems(9), { relationTo: 'articles', value: 1 }]
    const statuses = buildStatusMap(buildItems(9))

    await expect(runBeforeValidate(items, statuses)).rejects.toThrow(
      'Homepage featured content cannot contain duplicate entries.',
    )
  })

  it('rejects unsupported collections', async () => {
    const items = [...buildItems(9), { relationTo: 'locations', value: 99 }]
    const statuses = buildStatusMap(buildItems(9))

    await expect(runBeforeValidate(items, statuses)).rejects.toThrow(
      'Homepage featured content items must use supported collections and numeric ids.',
    )
  })
})
