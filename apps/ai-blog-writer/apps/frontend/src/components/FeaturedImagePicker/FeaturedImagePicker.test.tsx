/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeaturedImagePicker } from './FeaturedImagePicker'
import type { MediaAsset, MediaSet } from '../../features/staging/api/payload/payload.types'

const fetchMediaAssetsMock = vi.fn()
const fetchMediaSetsMock = vi.fn()
const pickerMocks = vi.hoisted(() => ({
  imageUploadProps: [] as Array<Record<string, unknown>>,
  buildImageFileNamePrefix: vi.fn((title: string, externalRef: string) => `${title}-${externalRef}`),
  pickVariantAssetId: vi.fn((_variantAssetIds: Record<string, string> | undefined, preferredVariant: string) =>
    preferredVariant === 'wide' ? 202 : null
  ),
}))

vi.mock('../../features/images', () => ({
  ImageUpload: (props: Record<string, unknown>) => {
    pickerMocks.imageUploadProps.push(props)
    return (
      <button
        type="button"
        onClick={() => {
          const onUploadComplete = props.onUploadComplete as (result: unknown) => void
          onUploadComplete({
            mediaSetId: '55',
            variantAssetIds: {
              wide: '202',
              editorial: '203',
            },
          })
        }}
      >
        Complete upload
      </button>
    )
  },
  MultiVariantCropper: () => null,
  uploadImageVariants: vi.fn(),
}))

vi.mock('../../features/staging/api/client/config', () => ({
  PAYLOAD_API_URL: 'http://localhost:4000',
}))

vi.mock('../../features/staging/api/external-images/external-images.api', () => ({
  fetchExternalImageSource: vi.fn(),
  searchPexelsImages: vi.fn(),
  searchUnsplashImages: vi.fn(),
}))

vi.mock('../../features/staging/api/payload/payload.api', () => ({
  fetchMediaAssets: (...args: unknown[]) => fetchMediaAssetsMock(...args),
  fetchMediaSets: (...args: unknown[]) => fetchMediaSetsMock(...args),
}))

vi.mock('../../features/staging/features/editorial-stage-article/media-utils', () => ({
  buildExternalAltText: vi.fn(() => 'Alt text'),
  buildExternalImportRef: vi.fn(() => 'external-ref'),
  buildExternalPhotographerCredit: vi.fn(() => 'Photographer credit'),
  buildImageFileNamePrefix: pickerMocks.buildImageFileNamePrefix,
  getPexelsPhotoImportUrl: vi.fn(() => 'https://example.com/pexels.jpg'),
  getUnsplashPhotoImportUrl: vi.fn(() => 'https://example.com/unsplash.jpg'),
  pickVariantAssetId: pickerMocks.pickVariantAssetId,
}))

function buildAsset(id: number, filename: string): MediaAsset {
  return {
    id,
    filename,
    url: `https://cdn.example.com/${filename}`,
  }
}

function buildMediaSet(id: number, previewAssetId: number, title: string): MediaSet {
  return {
    id,
    title,
    alt_text: `${title} alt`,
    variants: {
      editorial: {
        id: previewAssetId,
        filename: `${title.toLowerCase().replace(/\s+/g, '-')}.webp`,
        url: `https://cdn.example.com/${previewAssetId}.webp`,
      },
    },
  }
}

afterEach(() => {
  cleanup()
  fetchMediaAssetsMock.mockReset()
  fetchMediaSetsMock.mockReset()
  pickerMocks.imageUploadProps.length = 0
  pickerMocks.buildImageFileNamePrefix.mockClear()
  pickerMocks.pickVariantAssetId.mockClear()
  vi.restoreAllMocks()
})

describe('FeaturedImagePicker', () => {
  it('loads payload images page by page', async () => {
    fetchMediaAssetsMock
      .mockResolvedValueOnce({
        docs: [buildAsset(1, 'barranco-1.jpg')],
        totalDocs: 120,
        totalPages: 3,
      })
      .mockResolvedValueOnce({
        docs: [buildAsset(2, 'cusco-2.jpg')],
        totalDocs: 120,
        totalPages: 3,
      })

    render(
      <FeaturedImagePicker
        isOpen
        selectedId={null}
        token="token-123"
        locationRef={10}
        requireMediaSet={false}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByText('barranco-1.jpg')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()

    expect(fetchMediaAssetsMock).toHaveBeenNthCalledWith(1, 'token-123', {
      limit: 48,
      page: 1,
      mimeType: 'image/',
      variant: undefined,
    })

    fireEvent.click(screen.getByRole('button', { name: /next page/i }))

    await waitFor(() => {
      expect(fetchMediaAssetsMock).toHaveBeenNthCalledWith(2, 'token-123', {
        limit: 48,
        page: 2,
        mimeType: 'image/',
        variant: undefined,
      })
    })

    expect(await screen.findByText('cusco-2.jpg')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
  })

  it('shows one preview per media set when configured for media-set browsing', async () => {
    fetchMediaSetsMock
      .mockResolvedValueOnce({
        docs: [
          buildMediaSet(10, 101, 'Barranco murals'),
          buildMediaSet(11, 102, 'Cusco plaza'),
        ],
        totalDocs: 60,
        totalPages: 2,
      })
      .mockResolvedValueOnce({
        docs: [buildMediaSet(12, 103, 'Sacred Valley')],
        totalDocs: 60,
        totalPages: 2,
      })

    render(
      <FeaturedImagePicker
        isOpen
        selectedId={null}
        token="token-123"
        locationRef={10}
        payloadSourceMode="mediaSets"
        requireMediaSet={false}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByText('Barranco murals · Barranco murals alt')).toBeInTheDocument()
    expect(screen.getByText('Cusco plaza · Cusco plaza alt')).toBeInTheDocument()
    expect(screen.queryByText('101.webp')).not.toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()

    expect(fetchMediaSetsMock).toHaveBeenNthCalledWith(1, 'token-123', {
      limit: 48,
      page: 1,
    })

    fireEvent.click(screen.getByRole('button', { name: /next page/i }))

    await waitFor(() => {
      expect(fetchMediaSetsMock).toHaveBeenNthCalledWith(2, 'token-123', {
        limit: 48,
        page: 2,
      })
    })

    expect(await screen.findByText('Sacred Valley · Sacred Valley alt')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  })

  it('uses a unique upload identity and selects the configured preferred variant', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1775317303482)
    fetchMediaAssetsMock.mockResolvedValue({
      docs: [],
      totalDocs: 0,
      totalPages: 1,
    })
    const onSelect = vi.fn()
    const onClose = vi.fn()

    render(
      <FeaturedImagePicker
        isOpen
        selectedId={null}
        token="token-123"
        locationRef={10}
        payloadVariant="wide"
        uploadExternalRefBase="stl_123_featured_upload"
        uploadFileNameTitle="Best Lima Restaurants"
        requireMediaSet={false}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }))

    await waitFor(() => {
      expect(pickerMocks.imageUploadProps.length).toBeGreaterThan(0)
    })
    const uploadProps = pickerMocks.imageUploadProps.at(-1)
    expect(uploadProps?.externalRef).toBe('stl_123_featured_upload_1775317303482')
    expect(uploadProps?.fileNamePrefix).toBe('Best Lima Restaurants-stl_123_featured_upload_1775317303482')

    fireEvent.click(screen.getByRole('button', { name: /complete upload/i }))

    expect(pickerMocks.pickVariantAssetId).toHaveBeenCalledWith(
      {
        wide: '202',
        editorial: '203',
      },
      'wide',
    )
    expect(onSelect).toHaveBeenCalledWith(202)
    expect(onClose).toHaveBeenCalled()
  })
})
