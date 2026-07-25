import { useState } from 'react'
import type { MediaAsset, MediaSet } from '../../api/payload/payload.types'

/**
 * Source-agnostic multi-select buffer: an ordered list of ids plus resolution
 * maps, so assets picked from the Payload library and assets imported from a
 * provider can share one selection.
 */
export function useImagePickerSelectionBuffer(requiredCount: number) {
  const [bufferIds, setBufferIds] = useState<number[]>([])
  const [bufferAssets, setBufferAssets] = useState<Map<number, MediaAsset>>(new Map())
  const [bufferMediaSets, setBufferMediaSets] = useState<Map<number, MediaSet>>(new Map())

  const addToBuffer = (id: number, asset: MediaAsset | null, mode: 'toggle' | 'rolling') => {
    setBufferAssets((current) => {
      if (!asset) return current
      const next = new Map(current)
      next.set(id, asset)
      return next
    })
    setBufferIds((current) => {
      if (current.includes(id)) {
        return mode === 'toggle' ? current.filter((value) => value !== id) : current
      }
      if (current.length < requiredCount) return [...current, id]
      // Buffer full: rolling drops the oldest; toggle ignores the extra click.
      return mode === 'rolling' ? [...current.slice(1), id] : current
    })
  }

  const addMediaSetToBuffer = (mediaSet: MediaSet) => {
    setBufferMediaSets((current) => {
      const next = new Map(current)
      next.set(mediaSet.id, mediaSet)
      return next
    })
    setBufferIds((current) => {
      if (current.includes(mediaSet.id)) return current.filter((value) => value !== mediaSet.id)
      if (current.length < requiredCount) return [...current, mediaSet.id]
      return current
    })
  }

  const reset = () => {
    setBufferIds([])
    setBufferAssets(new Map())
    setBufferMediaSets(new Map())
  }

  return {
    bufferIds,
    bufferAssets,
    bufferMediaSets,
    addToBuffer,
    addMediaSetToBuffer,
    reset,
  }
}
