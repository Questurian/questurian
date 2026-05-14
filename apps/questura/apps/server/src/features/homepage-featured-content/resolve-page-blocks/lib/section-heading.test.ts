import { describe, expect, it } from 'vitest'

import { curatedBlockApiPayload } from './curated-block-api-payload'
import { homepageBlockSupportsSectionHeading } from './section-heading'

describe('homepage block section headings', () => {
  it('allows tour-grid blocks to store section text', () => {
    expect(homepageBlockSupportsSectionHeading('tour-grid')).toBe(true)
  })

  it('returns tour-grid section text in API payloads', () => {
    const selection = { totalSlots: 4, items: [] }

    expect(
      curatedBlockApiPayload(
        {
          id: 'tour-block',
          blockType: 'tour-grid',
          sectionHeading: ' Featured tours ',
          sectionSubheading: ' Curated local experiences ',
        },
        selection,
      ),
    ).toEqual({
      id: 'tour-block',
      blockType: 'tour-grid',
      selection,
      sectionHeading: 'Featured tours',
      sectionSubheading: 'Curated local experiences',
    })
  })
})
