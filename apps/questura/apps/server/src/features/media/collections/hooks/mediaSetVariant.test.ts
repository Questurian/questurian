import { describe, expect, it, vi } from 'vitest'

import { ensureMediaSetVariant, syncMediaSetVariant } from './mediaSetVariant'

type HookArgs = Parameters<typeof ensureMediaSetVariant>[0]

function createPayloadMock() {
  return {
    create: vi.fn(),
    findByID: vi.fn(),
    find: vi.fn(async () => ({ docs: [] })),
    update: vi.fn(),
  }
}

function runHook(
  data: Record<string, unknown>,
  payload: ReturnType<typeof createPayloadMock>,
  originalDoc?: Record<string, unknown>,
) {
  return ensureMediaSetVariant({
    data,
    req: { payload },
    originalDoc,
    operation: originalDoc ? 'update' : 'create',
    collection: { slug: 'media-assets' },
  } as unknown as HookArgs)
}

describe('ensureMediaSetVariant', () => {
  it('rejects a variant set without an existing mediaSet', async () => {
    const payload = createPayloadMock()

    await expect(
      runHook({ variant: 'thumbnail', alt_text: 'Sunset over Lima' }, payload),
    ).rejects.toThrow(/mediaSet/i)

    expect(payload.create).not.toHaveBeenCalled()
  })

  it('still requires variant when mediaSet is set', async () => {
    const payload = createPayloadMock()

    await expect(runHook({ mediaSet: 99 }, payload)).rejects.toThrow(
      'variant is required when mediaSet is set',
    )
  })

  it('clears inherited mediaSet when variant is explicitly cleared', async () => {
    const payload = createPayloadMock()

    const result = (await runHook(
      { variant: null },
      payload,
      { id: 5, mediaSet: 99, variant: 'thumbnail' },
    )) as Record<string, unknown>

    expect(result['variant']).toBeNull()
    expect(result['mediaSet']).toBeNull()
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('clears inherited variant when mediaSet is explicitly cleared', async () => {
    const payload = createPayloadMock()

    const result = (await runHook(
      { mediaSet: null },
      payload,
      { id: 5, mediaSet: 99, variant: 'thumbnail' },
    )) as Record<string, unknown>

    expect(result['mediaSet']).toBeNull()
    expect(result['variant']).toBeNull()
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('allows clearing mediaSet and variant together', async () => {
    const payload = createPayloadMock()

    const result = (await runHook(
      { mediaSet: null, variant: null },
      payload,
      { id: 5, mediaSet: 99, variant: 'thumbnail' },
    )) as Record<string, unknown>

    expect(result['mediaSet']).toBeNull()
    expect(result['variant']).toBeNull()
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('allows moving an asset between media sets and variants', async () => {
    const payload = createPayloadMock()

    const result = (await runHook(
      { mediaSet: 100, variant: 'square' },
      payload,
      { id: 5, mediaSet: 99, variant: 'thumbnail' },
    )) as Record<string, unknown>

    expect(result['mediaSet']).toBe(100)
    expect(result['variant']).toBe('square')
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          mediaSet: { equals: 100 },
          variant: { equals: 'square' },
        },
      }),
    )
  })

  it('rejects an unknown variant before checking the mediaSet rule', async () => {
    const payload = createPayloadMock()

    await expect(runHook({ variant: 'not-a-variant' }, payload)).rejects.toThrow(
      'variant must be one of',
    )
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('allows a carve-out upload (no mediaSet, no variant)', async () => {
    const payload = createPayloadMock()

    const result = (await runHook(
      { alt_text: 'Operator avatar', filename: 'avatar.webp' },
      payload,
    )) as Record<string, unknown>

    expect(result['mediaSet']).toBeUndefined()
    expect(result['variant']).toBeUndefined()
    expect(payload.create).not.toHaveBeenCalled()
  })
})

describe('syncMediaSetVariant', () => {
  it('clears previous media-set variant when asset is detached', async () => {
    const payload = createPayloadMock()
    payload.findByID.mockResolvedValueOnce({
      variants: {
        thumbnail: 5,
      },
    })

    await syncMediaSetVariant({
      doc: { id: 5, mediaSet: null, variant: null },
      previousDoc: { id: 5, mediaSet: 99, variant: 'thumbnail' },
      req: { payload },
      collection: { slug: 'media-assets' },
    } as never)

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media-sets',
        id: 99,
        data: {
          variants: {
            thumbnail: null,
          },
        },
      }),
    )
  })

  it('clears previous variant and updates new variant when asset moves', async () => {
    const payload = createPayloadMock()
    payload.findByID
      .mockResolvedValueOnce({
        variants: {
          thumbnail: 5,
        },
      })
      .mockResolvedValueOnce({
        variants: {
          square: null,
        },
      })

    await syncMediaSetVariant({
      doc: { id: 5, mediaSet: 100, variant: 'square' },
      previousDoc: { id: 5, mediaSet: 99, variant: 'thumbnail' },
      req: { payload },
      collection: { slug: 'media-assets' },
    } as never)

    expect(payload.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: 'media-sets',
        id: 99,
        data: {
          variants: {
            thumbnail: null,
          },
        },
      }),
    )
    expect(payload.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'media-sets',
        id: 100,
        data: {
          variants: {
            square: 5,
          },
        },
      }),
    )
  })
})
