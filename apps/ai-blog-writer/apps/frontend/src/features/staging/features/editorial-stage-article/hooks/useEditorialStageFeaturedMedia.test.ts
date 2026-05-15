import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorialStageFeaturedMedia } from './useEditorialStageFeaturedMedia'

describe('useEditorialStageFeaturedMedia', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-17T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes the featured upload ref for each modal session and keeps it stable while open', () => {
    const resetExternalImportState = vi.fn()
    const searchPexelsImages = vi.fn().mockResolvedValue({ photos: [] })
    const searchUnsplashImages = vi.fn().mockResolvedValue({ photos: [] })

    const { result } = renderHook(() => useEditorialStageFeaturedMedia({
      stagedArticleId: 'stage-123',
      articleTitle: 'Best Cafes in Lima',
      searchPexelsImages,
      searchUnsplashImages,
      resetExternalImportState,
    }))

    const initialRef = result.current.featuredImageUploadExternalRef
    expect(initialRef).toContain('stage-123_featured_upload_')

    act(() => {
      vi.setSystemTime(new Date('2026-03-17T12:00:01.000Z'))
      result.current.setShowImageModal(true)
    })

    const firstOpenRef = result.current.featuredImageUploadExternalRef
    const firstOpenPrefix = result.current.featuredImageFileNamePrefix
    expect(firstOpenRef).not.toBe(initialRef)

    act(() => {
      vi.setSystemTime(new Date('2026-03-17T12:00:02.000Z'))
      result.current.setImageSearch('some search query')
    })

    expect(result.current.featuredImageUploadExternalRef).toBe(firstOpenRef)
    expect(result.current.featuredImageFileNamePrefix).toBe(firstOpenPrefix)

    act(() => {
      result.current.setShowImageModal(false)
    })

    act(() => {
      vi.setSystemTime(new Date('2026-03-17T12:00:03.000Z'))
      result.current.setShowImageModal(true)
    })

    expect(result.current.featuredImageUploadExternalRef).not.toBe(firstOpenRef)
  })
})
