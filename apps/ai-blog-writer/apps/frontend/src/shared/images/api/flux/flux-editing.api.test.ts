import { describe, expect, it, vi } from 'vitest'
import { fluxEditApi } from '../flux-edit.api'
import { generateFluxEditedImage } from './flux-editing.api'

vi.mock('../flux-edit.api', () => ({
  fluxEditApi: vi.fn()
}))

describe('Flux editing public API', () => {
  it('forwards optional generation settings and returns image metadata', async () => {
    const referenceImage = new File(['reference'], 'reference.png', {
      type: 'image/png'
    })
    const additionalReferenceImage = new File(
      ['additional'],
      'additional.png',
      { type: 'image/png' }
    )
    const response = {
      blob: new Blob(['generated'], { type: 'image/png' }),
      fileName: 'generated.png',
      contentType: 'image/png',
      requestId: 'request-1',
      model: 'flux-2-pro',
      cost: 0.1,
      inputMegapixels: 1,
      outputMegapixels: 1
    }
    vi.mocked(fluxEditApi).mockResolvedValue(response)

    await expect(
      generateFluxEditedImage('Recreate this scene', referenceImage, {
        additionalReferenceImages: [additionalReferenceImage],
        modelId: 'flux-2-pro',
        width: 1200,
        height: 630,
        safetyTolerance: 2,
        promptUpsampling: true,
        seed: '1234'
      })
    ).resolves.toBe(response)

    expect(fluxEditApi).toHaveBeenCalledWith({
      prompt: 'Recreate this scene',
      referenceImage,
      additionalReferenceImages: [additionalReferenceImage],
      modelId: 'flux-2-pro',
      width: 1200,
      height: 630,
      safetyTolerance: 2,
      promptUpsampling: true,
      seed: '1234'
    })
  })
})
