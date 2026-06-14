import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../../../api'
import type { BlockImageModalState } from '../types'
import { IMG_BLOCK_MIN_HEIGHT, IMG_BLOCK_MIN_WIDTH, IMG_TRIO_DIMENSIONS } from '../constants'
import { useEditorialStageImageBlockAction } from './useEditorialStageImageBlockAction'

function asset(id: number, width: number, height: number): MediaAsset {
  return { id, filename: `asset-${id}.jpg`, width, height } as MediaAsset
}

type Params = Parameters<typeof useEditorialStageImageBlockAction>[0]

function setup(overrides: Partial<Params> = {}) {
  const mocks = {
    addImgPairAfterBlock: vi.fn(),
    addImgTrioAfterBlock: vi.fn(),
    mergeMediaAssetsIntoState: vi.fn(),
    closeBlockImageModal: vi.fn(),
    setPublishResult: vi.fn(),
  }
  const { result } = renderHook(() =>
    useEditorialStageImageBlockAction({
      blockImageModal: { show: true, blockId: 'b1', mode: 'img', replaceExistingBlock: false } as BlockImageModalState,
      requiredImageCount: 2,
      imgTrioFormat: 'square',
      imgBlockCaption: 'cap',
      ...mocks,
      ...overrides,
    }),
  )
  return { run: result.current, ...mocks }
}

describe('useEditorialStageImageBlockAction', () => {
  it('inserts an img pair from two correctly-sized assets', () => {
    const { run, addImgPairAfterBlock, mergeMediaAssetsIntoState, closeBlockImageModal } = setup()
    const one = asset(1, IMG_BLOCK_MIN_WIDTH, IMG_BLOCK_MIN_HEIGHT)
    const two = asset(2, IMG_BLOCK_MIN_WIDTH, IMG_BLOCK_MIN_HEIGHT)

    run([one, two])

    expect(addImgPairAfterBlock).toHaveBeenCalledWith('b1', one, two, 'cap', false)
    expect(mergeMediaAssetsIntoState).toHaveBeenCalledWith([one, two])
    expect(closeBlockImageModal).toHaveBeenCalled()
  })

  it('rejects an img pair with the wrong dimensions', () => {
    const { run, addImgPairAfterBlock, setPublishResult } = setup()

    run([asset(1, 100, 100), asset(2, 100, 100)])

    expect(addImgPairAfterBlock).not.toHaveBeenCalled()
    expect(setPublishResult).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    )
  })

  it('is a no-op when the asset count does not match', () => {
    const { run, addImgPairAfterBlock, setPublishResult } = setup()

    run([asset(1, IMG_BLOCK_MIN_WIDTH, IMG_BLOCK_MIN_HEIGHT)])

    expect(addImgPairAfterBlock).not.toHaveBeenCalled()
    expect(setPublishResult).not.toHaveBeenCalled()
  })

  it('inserts an img trio (square) from three correctly-sized assets', () => {
    const dims = IMG_TRIO_DIMENSIONS.square
    const { run, addImgTrioAfterBlock, closeBlockImageModal } = setup({
      blockImageModal: { show: true, blockId: 'b2', mode: 'img-trio', replaceExistingBlock: true } as BlockImageModalState,
      requiredImageCount: 3,
      imgTrioFormat: 'square',
    })
    const one = asset(1, dims.width, dims.height)
    const two = asset(2, dims.width, dims.height)
    const three = asset(3, dims.width, dims.height)

    run([one, two, three])

    expect(addImgTrioAfterBlock).toHaveBeenCalledWith('b2', 'square', one, two, three, 'cap', true)
    expect(closeBlockImageModal).toHaveBeenCalled()
  })

  it('does nothing for a default (single-image) modal', () => {
    const { run, addImgPairAfterBlock, addImgTrioAfterBlock } = setup({
      blockImageModal: { show: true, blockId: 'b3', mode: 'default', replaceExistingBlock: false } as BlockImageModalState,
    })

    run([asset(1, IMG_BLOCK_MIN_WIDTH, IMG_BLOCK_MIN_HEIGHT), asset(2, IMG_BLOCK_MIN_WIDTH, IMG_BLOCK_MIN_HEIGHT)])

    expect(addImgPairAfterBlock).not.toHaveBeenCalled()
    expect(addImgTrioAfterBlock).not.toHaveBeenCalled()
  })
})
