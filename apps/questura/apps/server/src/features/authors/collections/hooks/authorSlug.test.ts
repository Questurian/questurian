import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authorSlugHook, slugifyAuthorName } from './authorSlug'

const find = vi.fn()

function run(data: Record<string, unknown>, originalDoc?: Record<string, unknown>) {
  return (authorSlugHook as (args: unknown) => Promise<Record<string, unknown>>)({
    collection: { slug: 'authors' },
    context: {},
    data,
    operation: originalDoc ? 'update' : 'create',
    originalDoc,
    req: { payload: { find } },
  })
}

describe('slugifyAuthorName', () => {
  it('strips diacritics and punctuation', () => {
    expect(slugifyAuthorName('José Álvarez-Núñez')).toBe('jose-alvarez-nunez')
  })

  it('collapses separators and trims them from the ends', () => {
    expect(slugifyAuthorName('  Ada   Lovelace!  ')).toBe('ada-lovelace')
  })
})

describe('authorSlugHook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    find.mockResolvedValue({ docs: [] })
  })

  it('generates a slug from the display name when none is set', async () => {
    const data = await run({ displayName: 'Ada Lovelace' })

    expect(data.slug).toBe('ada-lovelace')
  })

  it('never regenerates an existing slug when the display name changes', async () => {
    const data = await run({ displayName: 'Renamed Person' }, { id: 1, slug: 'ada-lovelace' })

    // Absent from the write entirely, so the stored value is left alone.
    expect('slug' in data).toBe(false)
    expect(find).not.toHaveBeenCalled()
  })

  it('honours an explicitly typed slug, slugified', async () => {
    const data = await run({ slug: 'Ada The Great!' }, { id: 1, slug: 'ada-lovelace' })

    expect(data.slug).toBe('ada-the-great')
  })

  it('suffixes a taken slug until it is free', async () => {
    find
      .mockResolvedValueOnce({ docs: [{ id: 99 }] })
      .mockResolvedValueOnce({ docs: [{ id: 98 }] })
      .mockResolvedValueOnce({ docs: [] })

    const data = await run({ displayName: 'Ada Lovelace' })

    expect(data.slug).toBe('ada-lovelace-3')
  })

  it('does not treat the record being edited as a collision with itself', async () => {
    find.mockResolvedValue({ docs: [{ id: 7 }] })

    const data = await run({ slug: 'ada-lovelace' }, { id: 7, slug: 'something-else' })

    expect(data.slug).toBe('ada-lovelace')
  })

  it('prefixes purely numeric slugs, which are reserved for legacy id URLs', async () => {
    const data = await run({ displayName: '2024' })

    expect(data.slug).toBe('author-2024')
  })

  it('leaves the slug unset when there is nothing to build one from', async () => {
    const data = await run({ displayName: '' })

    expect(data.slug).toBeUndefined()
  })
})
