import { type ArrayField } from 'payload'
import { describe, expect, it } from 'vitest'

import { AuthorFeatureBlock } from './block'

const authorCardsField = AuthorFeatureBlock.fields.find(
  (field): field is ArrayField => 'name' in field && field.name === 'authorCards',
)

describe('AuthorFeatureBlock authorCards storage compatibility', () => {
  const validate = authorCardsField?.validate
  const legacyRows = [{ author: 1 }, { author: 2 }]

  function options(previousValue: unknown[]) {
    return {
      maxRows: authorCardsField?.maxRows,
      minRows: authorCardsField?.minRows,
      previousValue,
      required: authorCardsField?.required,
      req: { t: (key: string) => key },
    } as never
  }

  it('allows an unchanged legacy multi-Author snapshot through Payload validation', async () => {
    expect(authorCardsField).toBeDefined()
    expect(validate).toBeDefined()

    const result = await validate?.(legacyRows, options(legacyRows))

    expect(result).toBe(true)
  })

  it('rejects a newly introduced multi-Author value', async () => {
    const result = await validate?.(legacyRows, options([{ author: 1 }]))

    expect(result).toBe('Author Feature supports exactly one Author.')
  })
})
