/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaAsset, MediaSet } from '../../shared/api/payload/payload.types'
import type { ImagePickerProps } from '../../shared/images/picker'
import { FeaturedImagePicker } from './FeaturedImagePicker'

// Mock only the shell; keep the real mapping helpers (resolveMediaSetPreviewAssetId,
// pickUploadedAssetId) so we exercise the wrapper's actual contract.
const captured: { props: ImagePickerProps | null } = { props: null }

vi.mock('../../shared/images/picker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/images/picker')>()
  return {
    ...actual,
    ImagePicker: (props: ImagePickerProps) => {
      captured.props = props
      return null
    },
  }
})

afterEach(() => {
  cleanup()
  captured.props = null
})

describe('FeaturedImagePicker (adapter over ImagePicker)', () => {
  it('maps the legacy payload props onto the unified query', () => {
    render(
      <FeaturedImagePicker
        isOpen
        selectedId={7}
        token="t"
        locationRef={10}
        payloadSourceMode="mediaSets"
        payloadVariant="wide"
        requireMediaSet={false}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(captured.props?.query).toEqual({
      browseUnit: 'mediaSets',
      variant: 'wide',
      requireMediaSet: false,
    })
    expect(captured.props?.selectedId).toBe(7)
  })

  it('emits the asset id when an asset is selected', () => {
    const onSelect = vi.fn()
    render(
      <FeaturedImagePicker isOpen selectedId={null} token="t" locationRef={10} onSelect={onSelect} onClose={vi.fn()} />,
    )

    captured.props?.onSelect({ kind: 'assets', assets: [{ id: 42 } as MediaAsset] })
    expect(onSelect).toHaveBeenCalledWith(42)
  })

  it("emits a media set's preview-asset id when a set is selected", () => {
    const onSelect = vi.fn()
    render(
      <FeaturedImagePicker
        isOpen
        selectedId={null}
        token="t"
        locationRef={10}
        payloadSourceMode="mediaSets"
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )

    const mediaSet = { id: 9, variants: { editorial: { id: 101 } } } as unknown as MediaSet
    captured.props?.onSelect({ kind: 'mediaSets', mediaSets: [mediaSet] })
    expect(onSelect).toHaveBeenCalledWith(101)
  })

  it('emits the preferred-variant asset id on upload/import', () => {
    const onSelect = vi.fn()
    render(
      <FeaturedImagePicker
        isOpen
        selectedId={null}
        token="t"
        locationRef={10}
        payloadVariant="wide"
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )

    captured.props?.onSelect({
      kind: 'upload',
      response: { variantAssetIds: { wide: '202', editorial: '203' } } as never,
    })
    expect(onSelect).toHaveBeenCalledWith(202)
  })
})
