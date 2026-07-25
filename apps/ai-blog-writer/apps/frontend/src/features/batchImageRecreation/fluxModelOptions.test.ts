import { describe, expect, it } from 'vitest'

import { FLUX_MODEL_OPTIONS } from './fluxModelOptions'

describe('FLUX model options', () => {
  it('matches the model IDs supported by the image-generation API', () => {
    expect(FLUX_MODEL_OPTIONS.map((option) => option.id)).toEqual([
      'flux-2-max',
      'flux-2-pro-preview',
      'flux-2-pro',
      'flux-2-flex'
    ])
  })
})
