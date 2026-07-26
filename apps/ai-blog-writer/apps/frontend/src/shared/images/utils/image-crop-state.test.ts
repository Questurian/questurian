import { describe, expect, it } from 'vitest'
import { calculateDefaultCrop, initializeCropStates } from './image-crop-state'
import { VARIANT_SEQUENCE } from './image-variant-policy'

describe('image crop state', () => {
  it('centers a crop when the source is wider than the target', () => {
    expect(calculateDefaultCrop(1600, 900, 1)).toEqual({
      x: 350,
      y: 0,
      width: 900,
      height: 900
    })
  })

  it('centers a crop when the source is taller than the target', () => {
    expect(calculateDefaultCrop(800, 1200, 2)).toEqual({
      x: 0,
      y: 400,
      width: 800,
      height: 400
    })
  })

  it('starts every variant empty when dimensions are unavailable', () => {
    const states = initializeCropStates()

    for (const type of VARIANT_SEQUENCE) {
      expect(states[type]).toEqual({
        variantType: type,
        crop: { x: 0, y: 0 },
        zoom: 1,
        draftAreaPixels: null,
        croppedAreaPixels: null,
        completed: false
      })
    }
  })

  it('seeds centered drafts without confirming them', () => {
    const states = initializeCropStates(1600, 1200)

    expect(states.square.draftAreaPixels).toEqual({
      x: 200,
      y: 0,
      width: 1200,
      height: 1200
    })
    for (const type of VARIANT_SEQUENCE) {
      expect(states[type].draftAreaPixels).not.toBeNull()
      expect(states[type].croppedAreaPixels).toBeNull()
      expect(states[type].completed).toBe(false)
    }
  })
})
