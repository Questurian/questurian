import { describe, expect, it } from 'vitest'

import {
  CREATOR_KICKER_MAX_LENGTH,
  parseCreatorKickerBodyField,
  publicCreatorKicker,
} from './creator-kicker'
import { curatedBlockApiPayload } from '../resolve-page-blocks/lib/curated-block-api-payload'
import { formatPublicHomepageBlock } from '../resolve-page-blocks/lib/format-public-block'

describe('creator kicker', () => {
  it('trims an editor update and supports clearing it', () => {
    expect(parseCreatorKickerBodyField({ creatorKicker: '  Lima through local eyes  ' })).toEqual({
      ok: true,
      omit: false,
      value: 'Lima through local eyes',
    })
    expect(parseCreatorKickerBodyField({ creatorKicker: '  ' })).toEqual({
      ok: true,
      omit: false,
      value: null,
    })
  })

  it('rejects values over the field limit', () => {
    expect(
      parseCreatorKickerBodyField({ creatorKicker: 'x'.repeat(CREATOR_KICKER_MAX_LENGTH + 1) }),
    ).toEqual({
      ok: false,
      message: `creatorKicker must be ${CREATOR_KICKER_MAX_LENGTH} characters or fewer.`,
    })
  })

  it('returns clean public text', () => {
    expect(publicCreatorKicker({ creatorKicker: '  Meet your Lima creator  ' })).toBe(
      'Meet your Lima creator',
    )
  })

  it('includes the kicker in editor and public block payloads', () => {
    const selection = { totalSlots: 1, items: [], isComplete: true }
    const block = {
      id: 'creator-block',
      blockType: 'featured-creator-article',
      creatorKicker: '  Lima through local eyes  ',
      selection,
    }

    expect(curatedBlockApiPayload(block, selection)).toMatchObject({
      creatorKicker: 'Lima through local eyes',
    })
    expect(formatPublicHomepageBlock(block)).toMatchObject({
      creatorKicker: 'Lima through local eyes',
    })
  })
})
