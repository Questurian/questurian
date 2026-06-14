import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaAsset, MediaSet } from '../../api/payload/payload.types'
import type { ImagePickerQuery } from './imagePicker.types'
import { useImagePickerData } from './useImagePickerData'

vi.mock('../../api/payload/payload.api', () => ({
  fetchMediaAssets: vi.fn(),
  fetchMediaSets: vi.fn(),
}))

// Imported after the mock factory so these are the mocked implementations.
import { fetchMediaAssets, fetchMediaSets } from '../../api/payload/payload.api'

const mockFetchAssets = vi.mocked(fetchMediaAssets)
const mockFetchSets = vi.mocked(fetchMediaSets)

function asset(id: number, overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id,
    filename: `asset-${id}.jpg`,
    width: 1200,
    height: 900,
    variant: 'editorial',
    mediaSet: 1000 + id,
    ...overrides,
  } as MediaAsset
}

function page(docs: MediaAsset[], totalPages = 1) {
  return { docs, totalDocs: docs.length, totalPages }
}

const baseQuery: ImagePickerQuery = { browseUnit: 'assets' }

beforeEach(() => {
  mockFetchAssets.mockReset()
  mockFetchSets.mockReset()
})

describe('useImagePickerData', () => {
  it('loads page 1 of assets when opened', async () => {
    mockFetchAssets.mockResolvedValue(page([asset(1), asset(2)]))

    const { result } = renderHook(() =>
      useImagePickerData({ isOpen: true, token: 't', query: baseQuery, search: '', selectedId: null }),
    )

    await waitFor(() => expect(result.current.assets).toHaveLength(2))
    expect(mockFetchAssets).toHaveBeenCalledWith(
      't',
      expect.objectContaining({ page: 1, mimeType: 'image/' }),
    )
  })

  it('does not fetch while closed', () => {
    renderHook(() =>
      useImagePickerData({ isOpen: false, token: 't', query: baseQuery, search: '', selectedId: null }),
    )
    expect(mockFetchAssets).not.toHaveBeenCalled()
  })

  it('hydrates the selected asset when it is off the current page', async () => {
    mockFetchAssets.mockImplementation(async (_token, params) => {
      if (params?.id === 99) return page([asset(99)])
      return page([asset(1), asset(2)])
    })

    const { result } = renderHook(() =>
      useImagePickerData({ isOpen: true, token: 't', query: baseQuery, search: '', selectedId: 99 }),
    )

    await waitFor(() => expect(result.current.assets.some((a) => a.id === 99)).toBe(true))
    expect(mockFetchAssets).toHaveBeenCalledWith('t', expect.objectContaining({ limit: 1, id: 99 }))
  })

  it('dedups assets across load-more pages', async () => {
    mockFetchAssets.mockImplementation(async (_token, params) => {
      if (params?.page === 2) return page([asset(2), asset(3)], 2)
      return page([asset(1), asset(2)], 2)
    })

    const { result } = renderHook(() =>
      useImagePickerData({ isOpen: true, token: 't', query: baseQuery, search: '', selectedId: null }),
    )

    await waitFor(() => expect(result.current.assets).toHaveLength(2))
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())

    await waitFor(() => expect(result.current.assets.map((a) => a.id)).toEqual([1, 2, 3]))
  })

  it('filters out assets without a media set when requireMediaSet is set', async () => {
    mockFetchAssets.mockResolvedValue(page([asset(1, { mediaSet: 55 }), asset(2, { mediaSet: null })]))

    const { result } = renderHook(() =>
      useImagePickerData({
        isOpen: true,
        token: 't',
        query: { browseUnit: 'assets', requireMediaSet: true },
        search: '',
        selectedId: null,
      }),
    )

    await waitFor(() => expect(result.current.assets.map((a) => a.id)).toEqual([1]))
  })

  it('resets and refetches when the query variant changes', async () => {
    mockFetchAssets.mockImplementation(async (_token, params) =>
      page([params?.variant === 'wide' ? asset(10, { variant: 'wide' }) : asset(1)]),
    )

    const { result, rerender } = renderHook(
      ({ query }: { query: ImagePickerQuery }) =>
        useImagePickerData({ isOpen: true, token: 't', query, search: '', selectedId: null }),
      { initialProps: { query: { browseUnit: 'assets', variant: 'editorial' } as ImagePickerQuery } },
    )

    await waitFor(() => expect(result.current.assets.map((a) => a.id)).toEqual([1]))

    rerender({ query: { browseUnit: 'assets', variant: 'wide' } })

    await waitFor(() => expect(result.current.assets.map((a) => a.id)).toEqual([10]))
  })

  it('passes the search term to the server fetch', async () => {
    mockFetchAssets.mockResolvedValue(page([asset(1)]))

    renderHook(() =>
      useImagePickerData({ isOpen: true, token: 't', query: baseQuery, search: '  cafe  ', selectedId: null }),
    )

    await waitFor(() =>
      expect(mockFetchAssets).toHaveBeenCalledWith('t', expect.objectContaining({ search: 'cafe' })),
    )
  })

  it('browses media sets through fetchMediaSets', async () => {
    mockFetchSets.mockResolvedValue({
      docs: [{ id: 7, title: 'Set 7' } as unknown as MediaSet],
      totalDocs: 1,
      totalPages: 1,
    })

    const { result } = renderHook(() =>
      useImagePickerData({
        isOpen: true,
        token: 't',
        query: { browseUnit: 'mediaSets' },
        search: '',
        selectedId: null,
      }),
    )

    await waitFor(() => expect(result.current.mediaSets).toHaveLength(1))
    expect(result.current.assets).toHaveLength(0)
    expect(mockFetchSets).toHaveBeenCalled()
  })
})
